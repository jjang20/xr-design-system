"""Read completed finite controls evidence; never run product or browser."""
from pathlib import Path
import json,hashlib,sys,datetime
from PIL import Image
run,source=map(Path,sys.argv[1:3]); adapter=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
pin=lambda p:{'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
plan=load(adapter/'controls-plan.json');manifest=load(adapter/'baseline/manifest.json')
expected=plan['positiveStates']+['negative-'+x for x in plan['negativeScenarios']]+['multipoint-'+x for x in plan['multipointScenarios']]
assert len(expected)==len(set(expected))==27
source_pins=[]
for r in manifest['trackedInputs']+manifest['externalAssets']:
 p=source/r['path']; assert p.stat().st_size==r['bytes'] and sha(p.read_bytes())==r['sha256'];source_pins.append(r)
assert len(source_pins)==100
records=[]; images=[]; summaries=[]; lifecycles=[]; failures=[]; artifact_pins=[]; pixel_readbacks=[]
for directory in sorted(run.glob('controls-*')):
 if not directory.is_dir() or directory.name.startswith('controls-integration'):continue
 lifecycle=directory/'lifecycle.json'
 if lifecycle.exists():
  d=load(lifecycle);r=d['resourceReadback'];assert r['chromeAlive'] is False and r['portListening'] is False and not r['acquisitionPending'] and not r['serverAcquisitionPending'] and not r['serverListenPending'];assert all(x['status']=='completed' for x in d['cleanupResults']);lifecycles.append({'run':directory.name,'ok':d['ok'],'readback':r,**pin(lifecycle)});artifact_pins.append(pin(lifecycle))
 summary=directory/('summary.json' if (directory/'summary.json').exists() else 'failure.json')
 if not summary.exists():continue
 s=load(summary);assert s['sourceSha']==manifest['sourceSha'] and s['inputDigest']==manifest['inputDigest'];artifact_pins.append(pin(summary));summaries.append({'run':directory.name,'completedJobs':len(s['results']),'success':s['browserChecksPassed']})
 for imp in s['implementation']:
  p=directory/imp['path'];assert p.stat().st_size==imp['bytes'] and sha(p.read_bytes())==imp['sha256']
 for rec in s['results']:
  p=directory/rec['evidence']['path'];assert p.stat().st_size==rec['evidence']['bytes'] and sha(p.read_bytes())==rec['evidence']['sha256'];d=load(p);assert d['verified'] and d['result']['fixture']['verified'] and d['result']['readiness']['ready'];assert d['sourceInputsVerified']==100 and d['sourceSha']==manifest['sourceSha'];assert d['actualProducerModuleIdentity'] if 'actualProducerModuleIdentity' in d else d['result']['actualProducerModuleIdentity'];artifact_pins.append(pin(p))
  for image in rec['artifacts']:
   ip=directory/image['path'];assert ip.stat().st_size==image['bytes'] and sha(ip.read_bytes())==image['sha256']
   with Image.open(ip) as im:assert im.size==(1600,1000);im.verify()
   images.append(pin(ip));artifact_pins.append(pin(ip))
  optics=d['result'].get('optics')
  if optics:
   roi=optics['roi']; crop=(roi['x'],1000-roi['top'],roi['right'],1000-roi['y'])
   if optics.get('explicitRGBA8Target'):
    a=Image.open(directory/(rec['id']+'-noenv-body.png')).convert('RGBA').crop(crop)
    b=Image.open(directory/(rec['id']+'-noenv-body-opacity0.png')).convert('RGBA').crop(crop)
    diffs=[abs(x[3]-y[3]) for x,y in zip(a.getdata(),b.getdata())]
    observed={'changedAlpha':sum(x>=2 for x in diffs),'maxAlpha':max(diffs)}
    assert all(observed[k]==optics['contribution'][k] for k in observed)
    pixel_readbacks.append({'id':rec['id'],'kind':'encoded-PNG-alpha-only','observed':observed,'rawRgbNotComparedAfterCanvasPremultiplication':True})
   else:
    on=Image.open(directory/(rec['id']+'-secondary-on.png')).convert('RGBA');off=Image.open(directory/(rec['id']+'-secondary-off.png')).convert('RGBA');restored=Image.open(directory/(rec['id']+'-secondary-restored.png')).convert('RGBA')
    assert on.tobytes()==restored.tobytes()
    diffs=[max(abs(x[k]-y[k]) for k in range(3)) for x,y in zip(on.crop(crop).getdata(),off.crop(crop).getdata())]
    observed={'changed':sum(x>2 for x in diffs),'maxDifference':max(diffs),'restorationMax':0}
    assert all(observed[k]==optics[k] for k in observed)
    pixel_readbacks.append({'id':rec['id'],'kind':'encoded-PNG-opaque-RGB-and-full-frame-restore','observed':observed})
  records.append({'id':rec['id'],'run':directory.name,'evidence':pin(p),'pngs':len(rec['artifacts']),'contractSha256':d['contractSha256'],'fixtureSha256':d['fixtureSha256'],'multipointSha256':d['multipointSha256'],'browserModuleSha256':d['browserModuleSha256']})
 if not s['browserChecksPassed']:failures.append({'run':directory.name,'error':s['primaryError'],'completedPreserved':len(s['results'])})
assert sorted(r['id'] for r in records)==sorted(expected)
assert len(images)==31 and len(list(run.glob('controls-*/*.png')))==31
faults=load(run/'controls-integration-01/verification.json');assert faults['allPassed'] and len(faults['results'])==3 and faults['outputPngs']==0
for r in faults['results']:assert r['pass'] and r['cleanup']
for p in (run/'controls-integration-01').rglob('*.json'):
 if 'vite-cache' not in p.parts:artifact_pins.append(pin(p))
code=[pin(p) for p in sorted(adapter.glob('controls*')) if p.is_file()]
result={'schemaVersion':1,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha':manifest['sourceSha'],'inputDigest':manifest['inputDigest'],'sourceInputsVerified':100,'normalUniqueJobsPassed':27,'normalPngs':31,'normalRuns':summaries,'expectedFailuresPreserved':failures,'normalIsSingleAllGreenSuite':False,'regularResults':records,'lifecycleReadbacks':lifecycles,'actualAdapterFaults':faults['results'],'actualAdapterFaultScope':'3 separate expected-failure integrations; synthetic provider. Font-ready polling is deliberately forced not to finish after real producer fonts are ready.','pixelReadbacks':pixel_readbacks,'artifactPins':artifact_pins,'finalControlsCodePins':code,'allPassedWithinDeclaredScope':True,'independentReview':False,'limits':['Synthetic InputSystem input, not Quest tracking or comfort','Canonical stable fallback keys only; reverse explicit IDs not exercised','Leaf callback back(0) covered; other callback cancellation APIs remain product-regression evidence','Historical R6 RGB FAIL and alpha separation, R4 P2 remain','Raw geometry is not evaluated shader dent/squash; Blender export unsupported','No candidate profiles, board, product/preview/token modifications or remote work'], 'next':['Independent code/evidence review by root-assigned reviewer','Root Current-reference guard only after all lane gates close']}
p=run/'controls-audit.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'audit':pin(p),'jobs':27,'pngs':31,'faults':3,'artifacts':len(artifact_pins),'allPassedWithinDeclaredScope':True}))
