"""Offline Rocketbox -> compact glTF conversion. Requires bpy 4.3 and numpy<2.

Source: microsoft/Microsoft-Rocketbox (MIT). Input files stay outside the repo.
Usage: uv run --python 3.11 --with bpy==4.3.0 --with 'numpy<2' python
  scripts/convert-residents.py /private/tmp/terra-resident-source <output-folder>
"""
import bpy
import json
import math
import re
import sys
from pathlib import Path
from mathutils import Matrix, Vector

SOURCE = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
PEOPLE = [
    ('man-denim', 'Adults', 'Male_Adult_12', 'm'),
    ('man-casual', 'Adults', 'Male_Adult_06', 'm'),
    ('woman-casual', 'Adults', 'Female_Adult_01', 'f'),
    ('woman-knit', 'Adults', 'Female_Adult_11', 'f'),
    ('boy', 'Children', 'Male_Child_01', 'm'),
    ('girl', 'Children', 'Female_Child_01', 'f'),
]

def mesh_floor(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    return min((o.matrix_world @ v.co).z for o in objects
               for v in o.evaluated_get(graph).data.vertices)

def clean_materials(folder):
    for mat in bpy.data.materials:
        name = mat.name.split('.')[0]
        source = folder / 'Textures' / (name + '_color.tga')
        if not source.exists():
            raise RuntimeError('Missing diffuse texture: ' + str(source))
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Roughness'].default_value = 0.88
        shader.inputs['Specular IOR Level'].default_value = 0.18
        image = bpy.data.images.load(str(source), check_existing=True)
        image.scale(512, 512)
        # Retain hair-card alpha; JPEG clothing and face maps are much smaller.
        image.file_format = 'PNG' if 'opacity' in name else 'JPEG'
        texture_output = SOURCE / 'converted-textures'
        texture_output.mkdir(exist_ok=True)
        image.filepath_raw = str(texture_output / (name + ('.png' if 'opacity' in name else '.jpg')))
        image.save()
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        if 'opacity' in name:
            mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
            mat.surface_render_method = 'DITHERED'
        mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])

def bake_clip(arm, meshes, gender, clip):
    suffix = {'walk': 'walk_neutral_01', 'idle': 'idle_breathe_01', 'talk': 'gestic_talk_neutral_01'}[clip]
    folder = 'xy' if clip == 'walk' else 'static'
    old = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(SOURCE / 'Assets' / 'Animations' /
        ('all_animations_max_motextr_' + folder) / (gender + '_' + suffix + '.max.fbx')))
    imported = [o for o in bpy.data.objects if o not in old]
    src = next(o for o in imported if o.type == 'ARMATURE')
    start, end = [int(x) for x in src.animation_data.action.frame_range]
    end = min(end, start + 180) if clip != 'walk' else end
    bpy.context.scene.frame_set(start)
    origin = src.matrix_world.translation.copy()
    bpy.context.scene.frame_set(end)
    travel = (src.matrix_world.translation - origin).xy.length
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    arm.animation_data_create().action = action
    local_head = {b.name: b.bone.matrix_local.translation if not b.parent else
                  b.parent.bone.matrix_local.inverted() @ b.bone.matrix_local.translation for b in arm.pose.bones}
    base = arm.location.copy()
    rotations = arm.matrix_world.to_quaternion().inverted()
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        src_rotation = rotations @ src.matrix_world.to_quaternion()
        for pb in arm.pose.bones:
            source_bone = src.pose.bones.get(re.sub(r'^Bip\d+', 'Bip01', pb.name))
            if source_bone is None:
                continue
            # Copy anatomical world rotation, not raw local curves: source FBX
            # bind poses differ. Keep the target's limb lengths and proportions.
            position = (pb.parent.matrix @ local_head[pb.name]) if pb.parent else local_head[pb.name]
            rotation = src_rotation @ source_bone.matrix.to_quaternion()
            pb.matrix = Matrix.LocRotScale(position, rotation, Vector((1, 1, 1)))
        bpy.context.view_layer.update()
        arm.location = base
        bpy.context.view_layer.update()
        arm.location.z -= mesh_floor(meshes)
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            pb.keyframe_insert(data_path='rotation_quaternion', frame=frame-start)
            pb.keyframe_insert(data_path='location', frame=frame-start)
        arm.keyframe_insert(data_path='location', frame=frame-start)
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return action, max(0.7, travel)

manifest = []
for key, group, name, gender in PEOPLE:
    if len(sys.argv) > 3 and key not in sys.argv[3:]:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    folder = SOURCE / 'Assets' / 'Avatars' / group / name
    bpy.ops.import_scene.fbx(filepath=str(folder / 'Export' / (name + '.fbx')))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for obj in list(bpy.data.objects):
        obj.animation_data_clear()
        if obj.type not in ('MESH', 'ARMATURE'):
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    clean_materials(folder)
    clips = []
    for clip in ('idle', 'walk', 'talk'):
        action, travel = bake_clip(arm, meshes, gender, clip)
        clips.append(action)
        if clip == 'walk':
            walk_distance = travel
    arm.animation_data.action = None
    for action in list(bpy.data.actions):
        if action not in clips:
            bpy.data.actions.remove(action)
    for action in clips:
        track = arm.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 0, action)
    arm.animation_data.action = clips[0]
    scene.frame_set(0)
    bpy.context.view_layer.update()
    height = max((o.matrix_world @ v.co).z for o in meshes for v in o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices)
    if group == 'Children':
        walk_distance *= height / (1.83 if gender == 'm' else 1.74)
    for quality, ratio in (('near', 1.0), ('far', 0.25)):
        modifiers = []
        for obj in meshes:
            if ratio < 1:
                mod = obj.modifiers.new('Distant crowd reduction', 'DECIMATE')
                mod.ratio = ratio
                modifiers.append((obj, mod))
        destination = OUT / (key + '-' + quality + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB',
            export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True,
            export_force_sampling=True, export_frame_step=2, export_apply=True,
            export_image_format='AUTO', export_jpeg_quality=78,
            export_morph=False, export_cameras=False, export_lights=False)
        for obj, mod in modifiers:
            obj.modifiers.remove(mod)
    manifest.append({'id': key, 'source': str(folder.relative_to(SOURCE)),
        'height': height, 'walkDistance': walk_distance, 'license': 'MIT'})
    print('CONVERTED', manifest[-1], flush=True)
(OUT / 'conversion.json').write_text(json.dumps(manifest, indent=2) + '\n')
(OUT / 'LICENSE-Microsoft.txt').write_text((SOURCE / 'LICENSE.md').read_text())
