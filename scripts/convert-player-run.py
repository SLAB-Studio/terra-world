"""Bake the player's Rocketbox run into animation-only JSON; no duplicate mesh.

uv run --offline --python 3.11 --with bpy==4.3.0 --with 'numpy<2' python
  scripts/convert-player-run.py <Rocketbox-source-folder> <scratch-output-folder>
Copy scratch-output/player-run.json to public/models/residents afterwards.
Uses the SAME parent-first retargeting and glTF coordinates as existing humans.
"""
import bpy, json, runpy, struct, sys
from pathlib import Path

helpers = runpy.run_path(str(Path(__file__).with_name('convert-residents.py')))
source, out = Path(sys.argv[1]), Path(sys.argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.fbx(filepath=str(source / 'Assets/Avatars/Adults/Male_Adult_06/Export/Male_Adult_06.fbx'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in list(bpy.data.objects):
    o.animation_data_clear()
    if o.type not in ('MESH', 'ARMATURE'):
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
action, distance = helpers['bake_clip'](arm, meshes, 'm', 'run')
for a in list(bpy.data.actions):
    if a != action: bpy.data.actions.remove(a)
track = arm.animation_data.nla_tracks.new()
track.name = 'run'
track.strips.new('run', 0, action)
arm.animation_data.action = action
bpy.context.scene.frame_set(0)
# Temporary export guarantees identical local axes to the shipped glTF skeleton.
out.mkdir(parents=True, exist_ok=True)
path = out / 'player-run-bake.glb'
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_frame_step=1, export_skins=True,
    export_materials='NONE', export_morph=False, export_cameras=False, export_lights=False)
data = path.read_bytes()
size = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20+size])
binary = data[28+size:]
def accessor(index):
    a = doc['accessors'][index]; v = doc['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126
    count = {'SCALAR':1, 'VEC3':3, 'VEC4':4}[a['type']]
    start = v.get('byteOffset',0) + a.get('byteOffset',0)
    stride = v.get('byteStride',count*4)
    return [[round(x,7) for x in struct.unpack_from('<'+'f'*count,binary,start+i*stride)] for i in range(a['count'])]
animation = next(a for a in doc['animations'] if 'run' in a['name'])
channels=[]; duration=0
for channel in animation['channels']:
    prop = channel['target']['path']
    if prop not in ('translation','rotation'): continue
    sampler = animation['samplers'][channel['sampler']]
    times = [v[0] for v in accessor(sampler['input'])]
    values = accessor(sampler['output'])
    duration = max(duration,max(times))
    if all(v == values[0] for v in values): times,values=[0],[values[0]]
    channels.append({'node':doc['nodes'][channel['target']['node']]['name'],
        'property':'position' if prop=='translation' else 'rotationQuaternion',
        'keys':[[t,*v] for t,v in zip(times,values)]})
result={'version':1,'model':'man-casual','distance':distance,'duration':duration,'channels':channels}
target=out/'player-run.json'
target.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(json.dumps({'bytes':target.stat().st_size,'distance':distance,'duration':duration,'channels':len(channels)}))
