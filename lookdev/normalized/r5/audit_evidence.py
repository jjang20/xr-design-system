"""Audit pinned inputs and completed R5 browser receipts; never grants native support.

Usage: python3 audit_evidence.py SOURCE RUNS_JSON FRESH_REPORT_JSON
RUNS_JSON names controls, dock, push directories and a list of six layer directories.
All paths are supplied by the local operator and stay outside published evidence.
"""
import hashlib
import json
from pathlib import Path
import struct
import sys


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def audit(source, runs):
    here = Path(__file__).resolve().parent
    manifest = read(here / 'baseline/manifest.json')
    contract_bytes = (here / 'baseline/comparison-contract.json').read_bytes()
    contract = json.loads(contract_bytes)
    contract_hash = digest(contract_bytes)
    manifest_hash = digest((here / 'baseline/manifest.json').read_bytes())
    records = manifest['trackedInputs'] + manifest['externalAssets']
    inventory = [{k: r[k] for k in ('path', 'bytes', 'sha256')} for r in records]
    require(digest(json.dumps(inventory, sort_keys=True, separators=(',', ':')).encode()) == manifest['inputDigest'], 'Inventory digest mismatch')
    require(contract_hash == manifest['comparisonContractSha256'], 'Contract hash mismatch')
    require(contract['sourceSha'] == manifest['sourceSha'] and contract['inputDigest'] == manifest['inputDigest'], 'Contract input mismatch')
    errata_bytes = (here / 'contract-errata.json').read_bytes()
    errata = json.loads(errata_bytes)
    require(errata['appliesToContractSha256'] == contract_hash, 'Unit erratum contract mismatch')
    require(len({r['path'] for r in records}) == len(records), 'Duplicate input paths')
    for r in records:
        relative = Path(r['path'])
        require(not relative.is_absolute() and '..' not in relative.parts, 'Invalid source path')
        data = (source / relative).read_bytes()
        require(len(data) == r['bytes'] and digest(data) == r['sha256'], 'Source changed: ' + r['path'])

    def identity(report, *, layer=False):
        require(report['sourceSha'] == manifest['sourceSha'] and report['inputDigest'] == manifest['inputDigest'], 'Receipt input mismatch')
        require(report['contractSha256'] == contract_hash, 'Receipt parent contract mismatch')
        if not layer:
            require(report['manifestSha256'] == manifest_hash, 'Receipt manifest mismatch')

    def pinned_artifact(directory, record):
        p = Path(record['path'])
        require(not p.is_absolute() and '..' not in p.parts, 'Invalid artifact path')
        data = (directory / p).read_bytes()
        require(len(data) == record['bytes'] and digest(data) == record['sha256'], 'Artifact mismatch: ' + str(p))
        if p.suffix == '.png':
            require(data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == (1600, 1000), 'PNG framing mismatch')

    controls_dir = Path(runs['controls'])
    controls = read(controls_dir / 'summary.json')
    identity(controls)
    require(controls['scriptSha256'] == digest((here / 'controls_capture.mjs').read_bytes()) and controls['fixtureSha256'] == digest((here / 'controls_fixtures.mjs').read_bytes()), 'Controls implementation drift')
    require(controls['browserChecksPassed'] is True and controls['geometryExportPassed'] is False, 'Controls proof level mismatch')
    expected_controls = set(contract['states']['controls'])
    expected_negatives = {'negative-' + x for x in ('title-pinch', 'index-contact-only', 'tracking-loss', 'reset-cancel', 'one-owner')}
    require({r['id'] for r in controls['results']} == expected_controls | expected_negatives and len(controls['results']) == 14, 'Controls coverage incomplete')
    for r in controls['results']:
        require(r['verified'] is True, 'Control receipt failed')
        pinned_artifact(controls_dir, r['evidence'])
        evidence = read(controls_dir / r['evidence']['path'])
        identity(evidence)
        for pin in ('scriptSha256', 'fixtureSha256'):
            require(evidence[pin] == controls[pin], 'Control receipt implementation mismatch')
        field = 'scenario' if r['id'].startswith('negative-') else 'state'
        expected_id = r['id'][9:] if field == 'scenario' else r['id']
        require(evidence.get(field) == expected_id == evidence['result']['fixture'].get(field), 'Control state/scenario identity mismatch')
        require(r['artifacts'] == evidence['artifacts'], 'Control receipt artifact identity mismatch')
        require(evidence['verified'] is True and not evidence['errors'] and not evidence['networkFailures'], 'Control runtime errors')
        require(evidence['result']['fixture']['verified'] is True, 'Control fixture failed')
        if r['id'].endswith('-held'):
            active = [h for h in evidence['result']['fixture']['final']['controls'] if h['held']]
            require(len(active) == 1, 'Held owner evidence incomplete')
            h = active[0]
            require(abs(h['physicalDentM'] - .0015) < 1e-9 and abs(h['dentLocalM'] * h['worldScale'] - .0015) < 1e-9, 'Physical/local dent conversion mismatch')
        require(len(r['artifacts']) == (0 if r['id'].startswith('negative-') else 1), 'Control image coverage mismatch')
        for a in r['artifacts']:
            pinned_artifact(controls_dir, a)

    layers = []
    scene_contribution = set()
    for directory in map(Path, runs['layers']):
        report = read(directory / 'capture.json')
        identity(report, layer=True)
        require(report['allPassed'] is True and report['checks'] and all(c['passed'] is True for c in report['checks']), 'Layer checks failed')
        require(report['profileId'] == 'current' and not report['overrides'], 'Unexpected material candidate')
        require(not report['errors'] and not report['failedRequests'], 'Layer runtime errors')
        require(report['layersContractSha256'] == digest((here / 'layers-contract.json').read_bytes()), 'Layer contract drift')
        require(report['captureScriptSha256'] == digest((here / 'layers_capture.mjs').read_bytes()), 'Layer runner drift')
        expected_impl = {'capture-script.mjs': report['captureScriptSha256'], 'layers-contract.json': report['layersContractSha256'],
                         'parent-r5-contract.json': contract_hash, 'source-inventory.json': manifest_hash,
                         'runtime-defaults.json': report['settingsSha256']}
        require({a['path']: a['sha256'] for a in report['implementationEvidence']} == expected_impl and len(report['implementationEvidence']) == 5, 'Layer implementation inventory incomplete')
        rear_count = 1 if report['fixture'] == 'lighting' else 2
        face = report['view'] if report['view'] in ('side', 'back') else 'front'
        expected_images = {'browser-beauty.png', 'browser-beauty-restored.png'}
        for i in range(rear_count):
            expected_images |= {f'diagnostic-level-{i}-{suffix}.png' for suffix in ('empty', 'isolated-' + face, 'scene-on', 'scene-body-off')}
        require({a['path'] for a in report['images']} == expected_images and len(report['images']) == len(expected_images), 'Layer diagnostic image coverage incomplete')
        for stage in ('before', 'after'):
            require(report['sourceVerification'][stage] == {'passed': True, 'records': len(records), 'inputDigest': manifest['inputDigest']}, 'Layer source verification incomplete')
        for a in report['images']:
            pinned_artifact(directory, a)
        for a in report['implementationEvidence']:
            pinned_artifact(directory, a)
        for d in report['diagnostics']:
            if d['sceneApplicable'] and d['fullScene']['pixels'] >= 24 and d['fullScene']['changed'] >= 20 and d['fullScene']['maxDifference'] >= 3:
                scene_contribution.add((report['fixture'], d['level']))
        layers.append({'fixture': report['fixture'], 'view': report['view'], 'checks': len(report['checks'])})
    require({r['fixture'] + '/' + r['view'] for r in layers} == set(contract['states']['layers']) and len(layers) == 6, 'Layer coverage incomplete')
    require({('lighting', 0), ('modular', 0), ('modular', 1)} <= scene_contribution, 'Each rear level needs actual full-scene pixel evidence in at least one canonical view')

    suites = {}
    for key in ('dock', 'push'):
        directory = Path(runs[key])
        report = read(directory / 'summary.json')
        identity(report)
        require(report['allPassed'] is True and report['checks'] and all(c['pass'] is True for c in report['checks']) and not report['errors'], key + ' checks failed')
        require(report['sourcePinsBefore'] == len(records) == report['sourcePinsAfter'], key + ' inventory coverage mismatch')
        require(set(report['codePins']) == {'dock_push_capture.mjs', 'dock_push_fixtures.mjs'}, key + ' implementation inventory incomplete')
        for name, pin in report['codePins'].items():
            require(digest((here / name).read_bytes()) == pin, key + ' implementation changed')
        captures = [a for a in report['captures'] if a['kind'] == key]
        for a in captures:
            pinned_artifact(directory, a)
        if key == 'dock':
            require(len(captures) == 14, 'Dock image coverage incomplete')
            dock_states = {'rest', 'sphere-hover', 'sphere-held', 'sphere-moved', 'sphere-released', 'plate-held', 'plate-released'}
            require({(r['mode'], r['state']) for r in captures} == {(m, s) for m in ('hdr', 'noenv') for s in dock_states}, 'Dock states or optical modes incomplete')
            require({r['contractState'] for r in captures} == set(contract['states']['dock']), 'Dock contract mapping incomplete')
            for r in captures:
                state = read(directory / Path(r['path']).with_suffix('.json'))
                require(state['label'] == r['state'] and state['mode'] == r['mode'], 'Dock state receipt mismatch')
        else:
            require({r['scenario'] for r in captures} == {'palm', 'fingertips', 'one-child', 'single-index', 'pinch-excludes', 'patch-jump', 'articulation', 'behind'}, 'Push scenarios incomplete')
            require({r['contractScenario'] for r in captures} == set(contract['states']['push']), 'Push contract mapping incomplete')
            require({r['subcase'] for r in captures if r['scenario'] == 'fingertips'} == {'4-extended-pads', '3-extended-pads', '2-extended-pads'}, 'Finger threshold subcases incomplete')
            for count in (4, 3, 2):
                trace = read(directory / f'push-fingertips-{count}pads-trace.json')
                require(trace['scenario'] == 'fingertips' and trace['fingerCount'] == count and trace['subcase'] == f'{count}-extended-pads', 'Finger subcase identity mismatch')
                require(trace['checks'] and all(c['pass'] is True for c in trace['checks']), 'Finger boundary checks failed')
        suites[key] = {'sharedSuiteChecks': len(report['checks']), 'captures': len(captures)}

    artifacts = []
    seen_paths = set()
    for lane, directories in [('controls', [controls_dir]), ('layers', list(map(Path, runs['layers']))), ('dock', [Path(runs['dock'])]), ('push', [Path(runs['push'])])]:
        for index, directory in enumerate(directories):
            for p in sorted(directory.iterdir()):
                if p.is_file() and p.suffix in ('.json', '.png', '.mjs'):
                    if p.resolve() in seen_paths:
                        continue
                    seen_paths.add(p.resolve())
                    data = p.read_bytes()
                    artifacts.append({'lane': lane, 'runIndex': index, 'path': p.name, 'bytes': len(data), 'sha256': digest(data)})
    return {'schemaVersion': 1, 'sourceSha': manifest['sourceSha'], 'inputDigest': manifest['inputDigest'],
            'contractSha256': contract_hash, 'contractErrataSha256': digest(errata_bytes), 'inputRecordsVerified': len(records), 'browserEvidenceAuditPassed': True,
            'controls': {'positiveStates': 9, 'negativeScenarios': 5}, 'layers': layers, **suites,
            'artifacts': artifacts, 'normalizedBlenderExportVerified': False, 'physicalOpticalEquivalence': False,
            'questAccepted': False, 'designAdopted': False,
            'historicalR4StrictCalibration': {'pass': 2, 'fail': 4, 'severity': 'P2', 'waived': False}}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    result = audit(Path(sys.argv[1]).resolve(), read(sys.argv[2]))
    with Path(sys.argv[3]).open('x') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'artifacts'}))
