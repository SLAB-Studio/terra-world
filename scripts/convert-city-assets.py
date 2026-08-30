"""Offline city asset compiler: bpy 4.3, numpy<2. Sources in fetch-city-assets.mjs.
Usage: python scripts/convert-city-assets.py SOURCE PUBLIC/models/city
Exports compact, self-contained GLBs. No Blender/runtime CDN requirement.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector

source, output = Path(sys.argv[1]), Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def bounds(objects):
    points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
    return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]

def flatten(objects):
    for o in objects:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
        o.animation_data_clear()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o not in objects: bpy.data.objects.remove(o, do_unlink=True)

def triangles(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)

def simplify(objects, budget):
    fixed = sum(triangles(o) for o in objects if o.get('preserve_geometry') or triangles(o)<32)
    total = sum(triangles(o) for o in objects) - fixed
    ratio = min(1, max(0, budget-fixed) / max(1, total))
    for o in objects:
        if o.get('preserve_geometry') or triangles(o) < 32: continue
        mod = o.modifiers.new('Browser geometry budget', 'DECIMATE')
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)

def compact_materials():
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nodes = m.node_tree.nodes
        shader = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not shader: continue
        keep_image = None
        if shader.inputs['Base Color'].links:
            n = shader.inputs['Base Color'].links[0].from_node
            if n.type == 'TEX_IMAGE': keep_image = n.image
        colour = tuple(shader.inputs['Base Color'].default_value)
        alpha = shader.inputs['Alpha'].default_value
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        p = nodes.new('ShaderNodeBsdfPrincipled')
        p.inputs['Base Color'].default_value = colour
        p.inputs['Alpha'].default_value = alpha
        p.inputs['Roughness'].default_value = .82
        p.inputs['Specular IOR Level'].default_value = .18
        if keep_image:
            keep_image.scale(512, 512)
            t=nodes.new('ShaderNodeTexImage'); t.image=keep_image
            m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])

def export(key, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output / (key+'.glb')), export_format='GLB', use_selection=True,
        export_animations=False, export_image_format='JPEG', export_jpeg_quality=82,
        export_extras=False, export_cameras=False, export_lights=False)
    lo, hi = bounds(objects)
    record = {'id': key, 'triangles': sum(triangles(o) for o in objects), 'dimensions': [hi[i]-lo[i] for i in range(3)], 'bytes': (output/(key+'.glb')).stat().st_size}
    print('ASSET', record, flush=True)
    return record

manifest=[]
for key, name in [('broadleaf','island_tree_02'),('fir','fir_sapling')]:
    clear(); bpy.ops.import_scene.gltf(filepath=str(source/name/'source.gltf'))
    objects=[o for o in bpy.data.objects if o.type=='MESH']
    if key=='fir':
        # The source contains three alternatives; use one, not three overlapping trees.
        keep=sorted(objects,key=lambda o:o.name)[0]
        for o in objects:
            if o!=keep: bpy.data.objects.remove(o,do_unlink=True)
        objects=[keep]
    flatten(objects)
    lo,hi=bounds(objects)
    scale=7.2/(hi[2]-lo[2])
    centre=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]))
    for o in objects:
        for v in o.data.vertices: v.co=(v.co-centre)*scale
        o.data.update()
    compact_materials()
    simplify(objects,16000)
    manifest.append(export(key+'-near',objects))
    simplify(objects,8000)
    manifest.append(export(key+'-far',objects))

clear(); bpy.ops.import_scene.gltf(filepath=str(source/'car/source.glb'))
objects=[o for o in bpy.data.objects if o.type=='MESH']
# Remember the complete wheel assemblies before flattening their hierarchy.
for o in objects:
    ancestor=o
    while ancestor:
        if ancestor.name in ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']:
            o['wheel_group']=ancestor.name
            break
        ancestor=ancestor.parent
# Deep unseen mechanical/interior detail and trademarks are not needed by traffic.
for o in list(objects):
    if any(s in o.name.lower() for s in ['engine','emblem','license','pedal','floormat','steering','brakepad','brakedisc','hoodinterior','hoodunder']):
        bpy.data.objects.remove(o,do_unlink=True); objects.remove(o)
flatten(objects)
# Consolidate numerous source materials into six inexpensive opaque groups.
palette={'paint':(.25,.31,.34,1),'glass':(.035,.065,.075,1),'trim':(.09,.105,.11,1),'metal':(.48,.5,.51,1),'headlamp':(.85,.9,.86,1),'taillamp':(.43,.025,.018,1)}
mats={}
for name,colour in palette.items():
    m=bpy.data.materials.new('vehicle-'+name); m.diffuse_color=colour; m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=colour
    p.inputs['Roughness'].default_value=.28 if name in ['paint','glass'] else .7
    # Restrained non-metallic finish stays visible without an expensive reflection probe.
    p.inputs['Metallic'].default_value=.12 if name=='metal' else 0
    mats[name]=m
for o in objects:
    for slot in o.material_slots:
        n=slot.material.name.lower() if slot.material else ''
        category='paint' if 'paint' in n else 'glass' if 'glass' in n else 'headlamp' if 'headlight' in n else 'taillamp' if 'brakelight' in n else 'metal' if any(x in n for x in ['rim','hardware','mirror','disc']) else 'trim'
        slot.material=mats[category]
lo,hi=bounds(objects)
# Imported model uses its longest horizontal axis for travel; front hood locates heading.
hood=next(o for o in objects if o.name=='BodyHood')
hood_lo,hood_hi=bounds([hood]); center=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]))
front=Vector(((hood_lo[0]+hood_hi[0])/2-center.x,(hood_lo[1]+hood_hi[1])/2-center.y,0))
rotation=Matrix.Rotation(math.atan2(front.x,front.y),4,'Z')
for o in objects:
    for v in o.data.vertices: v.co=rotation@(v.co-center)
    o.data.update()
lo,hi=bounds(objects); scale=4.2/(hi[1]-lo[1])
for o in objects:
    for v in o.data.vertices:
        v.co*=scale
        v.co.x*=1.8/((hi[0]-lo[0])*scale)
    o.data.update()
# Merge the body and each wheel assembly. Preserve each wheel's centre for rolling.
groups={}
for o in objects:
    category='lighting' if o.name in ['BodyHeadlights','BodyTaillights'] else o.get('wheel_group','body')
    groups.setdefault(category,[]).append(o)
merged=[]
for key,parts in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
    o=parts[0]; o.name=key
    if key=='lighting': o['preserve_geometry']=True
    if key.startswith('Wheel'): bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY',center='BOUNDS')
    merged.append(o)
simplify(merged,12000); manifest.append(export('crossover-near',merged))
simplify(merged,8000); manifest.append(export('crossover-far',merged))

clear()
# A short-wheelbase urban shuttle, authored for Rivergate's existing bus lanes.
def bus_material(name, colour, rough=.65):
    mat=bpy.data.materials.new('vehicle-'+name); mat.diffuse_color=(*colour,1); mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*colour,1); p.inputs['Roughness'].default_value=rough
    return mat
paint=bus_material('paint',(.58,.63,.6)); glass=bus_material('glass',(.027,.052,.061),.22)
trim=bus_material('trim',(.025,.028,.03)); metal=bus_material('metal',(.34,.36,.38),.35)
front_lamp=bus_material('headlamp',(.87,.9,.85)); rear_lamp=bus_material('taillamp',(.43,.02,.015))
bus_parts=[]; bus_wheels=[]
def box(name,location,scale,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Rounded coachwork','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons:p.use_smooth=True
    bus_parts.append(o); return o
box('body',(0,0,1.52),(1.72,5.5,2.32),paint,.16)
box('roof',(0,-.05,2.76),(1.69,5.22,.18),paint,.08)
box('windscreen',(0,2.772,1.96),(1.44,.035,1.16),glass,.07)
box('lower-grille',(0,2.76,.77),(1.05,.04,.27),trim,.04)
box('route-display',(0,2.737,2.56),(.98,.035,.14),trim,.025)
for side in [-1,1]:
    for y in [-1.85,-.68,.49]: box('side-window',(side*.867,y,2.02),(.024,1.01,.99),glass,.045)
    box('driver-window',(side*.867,1.67,2.02),(.024,.92,.99),glass,.045)
    box('waist-line',(side*.873,0,1.43),(.025,5.04,.07),trim)
    box('mirror-arm',(side*.93,2.35,2.0),(.18,.07,.06),metal)
    box('mirror',(side*1.0,2.33,1.95),(.1,.17,.28),trim,.04)
    box('headlamp',(side*.6,2.762,.94),(.36,.04,.18),front_lamp,.035)
    box('taillamp',(side*.62,-2.755,1.04),(.2,.04,.5),rear_lamp,.025)
box('passenger-door',(0.883,1.28,1.29),(.03,.99,1.79),glass,.035)
box('door-rail',(0.904,1.28,1.26),(.02,.035,1.8),metal)
box('rear-window',(0,-2.753,2.0),(1.38,.025,.83),glass,.06)
for x in [-.77,.77]:
    for y in [-1.71,1.69]:
        name=('WheelFront' if y>0 else 'WheelRear')+('L' if x<0 else 'R')
        parts=[]
        for radius,depth,dx,mat in [(.39,.26,0,trim),(.23,.015,-.142 if x<0 else .142,metal)]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=radius,depth=depth,location=(x+dx,y,.39),rotation=(0,math.pi/2,0))
            o=bpy.context.object;o.data.materials.append(mat);parts.append(o)
            for p in o.data.polygons:p.use_smooth=True
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();wheel=parts[0];wheel.name=name
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY',center='BOUNDS');bus_wheels.append(wheel)
bpy.ops.object.select_all(action='DESELECT')
for o in bus_parts:o.select_set(True)
bpy.context.view_layer.objects.active=bus_parts[0];bpy.ops.object.join();body=bus_parts[0];body.name='body'
bus=[body,*bus_wheels]
manifest.append(export('shuttlebus-near',bus));simplify(bus,1800);manifest.append(export('shuttlebus-far',bus))

# Compress photographed surfaces; keep originals outside the shipped directory.
for name in ['asphalt','brick','stone','slate','grass']:
    image=bpy.data.images.load(str(source/'surfaces'/(name+'.jpg')))
    image.scale(512,512); image.file_format='JPEG'; image.filepath_raw=str(output/(name+'.jpg')); image.save()
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
