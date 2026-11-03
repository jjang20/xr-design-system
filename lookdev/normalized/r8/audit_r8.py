"""Read-only exact-source and recorded-lane evidence audit; never runs a renderer."""
import argparse,hashlib,json,pathlib,subprocess
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('run',type=pathlib.Path);p.add_argument('out',type=pathlib.Path);args=p.parse_args()
a=pathlib.Path(__file__).resolve().parent;source=args.source.resolve();run=args.run.resolve()
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
manifest=load(a/'baseline/manifest.json');records=manifest['trackedInputs']+manifest['externalAssets'];checks=[]
def check(name,condition,detail=None):
 checks.append(dict(name=name,passed=bool(condition),detail=detail))
def filecheck(p,record):
 b=p.read_bytes();check('pin '+str(p),len(b)==record['bytes'] and sha(b)==record['sha256']);return b
check('exact source HEAD',subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==manifest['sourceSha'])
check('source tracked unchanged',not subprocess.check_output(['git','-C',str(source),'status','--porcelain','--untracked-files=no'],text=True).strip())
for r in records:filecheck(source/r['path'],r)
check('source count100',len(records)==100)
check('contract hash',sha((a/'baseline/comparison-contract.json').read_bytes())==manifest['comparisonContractSha256'])
check('ordered input digest',sha(json.dumps([{k:r[k] for k in ('bytes','path','sha256')} for r in records],ensure_ascii=False,separators=(',',':')).encode())==manifest['inputDigest'])
lanes=[]
for name in ['controls-handoff.json','layers-handoff.json','dock-handoff.json']:
 path=run/name
 if not path.exists():lanes.append(dict(name=name,status='NOT_HANDED_OFF'));continue
 d=load(path);lanes.append(dict(name=name,sha256=sha(path.read_bytes()),bytes=path.stat().st_size,status=d.get('status'),sourceSha=d.get('sourceSha')))
 check('lane source '+name,d.get('sourceSha')==manifest['sourceSha'])
# Files are versioned per attempt. Observe raw statuses; do not convert failed
# attempts or missing output into a passing lane or a candidate execution gate.
runs=[]
for case in sorted(run.iterdir()):
 if not case.is_dir() or not any(case.name.startswith(x) for x in ('controls-','layers-','dock-')):continue
 life=case/'lifecycle.json'
 if not life.exists():continue
 d=load(life);rd=d.get('resourceReadback',{});images=[]
 for png in sorted(case.glob('*.png')):
  with Image.open(png) as im:im.verify()
  with Image.open(png) as im:width,height=im.size
  b=png.read_bytes();images.append(dict(path=str(png),bytes=len(b),sha256=sha(b),width=width,height=height))
 runs.append(dict(path=str(case),lifecycleOk=d.get('ok'),primaryError=d.get('primaryError'),reportError=d.get('reportError'),cleanupResults=d.get('cleanupResults'),resourceReadback=rd,pngCount=len(images),images=images))
 check('no owned resource pending '+case.name,rd.get('chromeAlive') is False and rd.get('portListening') is False and not rd.get('acquisitionPending') and not rd.get('serverAcquisitionPending') and not rd.get('serverListenPending'))
result=dict(sourceSha=manifest['sourceSha'],contractSha256=manifest['comparisonContractSha256'],inputDigest=manifest['inputDigest'],sourceInputCount=len(records),scope='Exact input/hash, recorded attempts, PNG decode/dimensions, reported owned-resource closure; no suite/renderer rerun or inferred lane pass',checks=checks,allReadbackChecksPassed=all(c['passed'] for c in checks),lanes=lanes,runs=runs,actualPreservedTechnicalPngFiles=sum(r['pngCount'] for r in runs),candidateGatePassed=False,candidateGateReason='Separate owner judgement and independent review required for lane coverage and failed attempts')
with args.out.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(dict(checks=len(checks),allReadbackChecksPassed=result['allReadbackChecksPassed'],handedOff=[x['name'] for x in lanes if x['status']!='NOT_HANDED_OFF'],runs=len(runs),pngFiles=result['actualPreservedTechnicalPngFiles'])))
