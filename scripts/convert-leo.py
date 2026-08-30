"""Convert the attributed Shiba Inu into a compact, grounded game companion.

Usage: uv run --offline --python 3.11 --with bpy==4.3.0 --with 'numpy<2'
  python scripts/convert-leo.py source-dog.glb output-directory
Source/provenance: apps/web/public/models/leo/README.md.
Only standing, a four-beat walk and diagonal-pair trot are shipped; no tricks loop.
"""
import bpy, math, sys, json, hashlib
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

source, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene; scene.render.fps=30
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.data.objects if o.type=='MESH' and len(o.data.materials)>0)
for track in arm.animation_data.nla_tracks: track.mute=True
arm.animation_data.action=next(a for a in bpy.data.actions if a.name.startswith('standing'))
scene.frame_set(0);bpy.context.view_layer.update()
unit=arm.matrix_world.to_scale().x
rest={b.name:b.matrix_basis.copy() for b in arm.pose.bones}
arm.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
def bone(prefix): return next(b for b in arm.pose.bones if b.name.startswith(prefix+'.'))
legs=[]
for side, phase in [('L',0.0),('R',0.5)]:
    for front in [False,True]:
        prefixes=([f'{side}_shoulder_jnt',f'{side}_elbow_jnt',f'{side}_wrist_jnt',f'{side}_hand_jnt'] if front
                  else [f'{side}_hip_jnt',f'{side}_knee_jnt',f'{side}_ankle_jnt',f'{side}_foot_jnt'])
        chain=[bone(p) for p in prefixes]
        legs.append((chain,chain[-1].head.copy(),chain[-1].matrix.to_quaternion(),(phase+(0.25 if front else 0))%1))
def reset():
    for b in arm.pose.bones: b.matrix_basis=rest[b.name]
    bpy.context.view_layer.update()
def key(frame):
    for b in arm.pose.bones:
        b.rotation_mode='QUATERNION'
        b.keyframe_insert(data_path='rotation_quaternion',frame=frame)
        b.keyframe_insert(data_path='location',frame=frame)
def solve(chain,target,rotation):
    # CCD in armature space; imported FBX bone tails are NOT joint endpoints.
    # Rotate around actual joint heads, preserving all anatomical segment lengths.
    for _ in range(18):
        for joint in reversed(chain[:-1]):
            a=chain[-1].head-joint.head;b=target-joint.head
            if a.length<1e-5 or b.length<1e-5: continue
            q=a.rotation_difference(b)
            joint.matrix=Matrix.Translation(joint.head)@q.to_matrix().to_4x4()@Matrix.Translation(-joint.head)@joint.matrix
            bpy.context.view_layer.update()
    foot=chain[-1]
    foot.matrix=Matrix.LocRotScale(foot.head,rotation,Vector((1,1,1)))
    bpy.context.view_layer.update()
clips=[]
for clip, frames in [('idle',60),('walk',30),('trot',24)]:
    action=bpy.data.actions.new(clip);clips.append(action)
    arm.animation_data_create().action=None
    samples=[]
    for frame in range(frames+1):
        reset();t=frame/frames
        if clip in ('walk','trot'):
            for chain,base,rotation,offset in legs:
                if clip=='trot':
                    # Diagonal pairs: left hind + right front, then the opposite.
                    side = chain[0].name.startswith('L_')
                    front = 'shoulder' in chain[0].name
                    offset = 0 if side != front else .5
                phase=(t+offset)%1
                target=base.copy()
                # Four-beat walking gait; stance foot travels backwards at a
                # constant speed. Swing uses a smooth lift and return arc.
                stance=.5 if clip=='trot' else .62
                stride=(1.05 if clip=='trot' else .72)/unit
                if phase<stance:
                    target.y+=stride*(phase-stance/2)
                else:
                    u=(phase-stance)/(1-stance)
                    target.y+=stride*stance*(.5-u)
                    target.z+=(.105 if clip=='trot' else .085)/unit*math.sin(math.pi*u)
                solve(chain,target,rotation)
        else:
            b=bone('breathe_jnt');b.scale=(1,1,1+.006*math.sin(t*math.tau))
        samples.append({b.name:(b.rotation_quaternion.copy(),b.location.copy(),b.scale.copy()) for b in arm.pose.bones})
    # Baking while the action is active lets depsgraph evaluation overwrite
    # the IK solver with earlier keys. Record first, then write curves once.
    arm.animation_data.action=action
    for frame,sample in enumerate(samples):
        for b in arm.pose.bones:
            b.rotation_quaternion,b.location,b.scale=sample[b.name]
            b.keyframe_insert(data_path='scale',frame=frame)
        key(frame)
    for fc in action.fcurves:
        for k in fc.keyframe_points:k.interpolation='LINEAR'
    arm.animation_data.action=None
# Use the diffuse + normal maps, capped at 1K; avoid expensive fur geometry.
mat=mesh.data.materials[0];nodes=mat.node_tree.nodes
images=[n.image for n in nodes if n.type=='TEX_IMAGE' and n.image]
diffuse=next(i for i in images if i.name.startswith('Image_0'))
normal=next((i for i in images if i.name.startswith('Image_2')),None)
nodes.clear();shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial')
shader.inputs['Roughness'].default_value=.86;shader.inputs['Specular IOR Level'].default_value=.2
mat.node_tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
for im,role in [(diffuse,'diffuse'),(normal,'normal')]:
    if not im:continue
    im.scale(1024,1024);im.file_format='JPEG';im.filepath_raw=str(out/(role+'.jpg'));im.save()
    texture=nodes.new('ShaderNodeTexImage');texture.image=im
    if role=='diffuse':mat.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
    else:
        n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.5
        mat.node_tree.links.new(texture.outputs['Color'],n.inputs['Color']);mat.node_tree.links.new(n.outputs['Normal'],shader.inputs['Normal'])
bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
mod=mesh.modifiers.new('Companion budget','DECIMATE');mod.ratio=.34
mesh.modifiers.move(len(mesh.modifiers)-1,0)
bpy.ops.object.modifier_apply(modifier=mod.name)
for a in clips:
    tr=arm.animation_data.nla_tracks.new();tr.name=a.name
    tr.strips.new(a.name,0,a)
arm.animation_data.action=None
scene.frame_set(0)
bpy.ops.export_scene.gltf(filepath=str(out/'leo.glb'),export_format='GLB',
    export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,
    export_force_sampling=True,export_frame_step=1,export_apply=True,
    export_image_format='JPEG',export_jpeg_quality=85,export_morph=False)
meta={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),
      'walkDistance':.72,'trotDistance':1.05,'scale':.9,'clips':['idle','walk','trot'],'textureLimit':1024,'bytes':(out/'leo.glb').stat().st_size}
(out/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps(meta))
