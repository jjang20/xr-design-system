"""Compare unaligned neutral captures; requires existing Pillow, NumPy and SciPy."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


def compare(browser, reference):
    arrays = []
    for path in [browser, reference]:
        with Image.open(path) as image:
            if image.size != (1600, 1000):
                raise ValueError('Expected the frozen 1600 x 1000 capture')
            rgba = np.asarray(image.convert('RGBA'))
            if not np.all(rgba[:, :, 3] == 255):
                raise ValueError('Calibration must be opaque')
            if np.ptp(rgba[:, :, :3].astype(float)) < 50:
                raise ValueError('Blank or insufficient-contrast calibration')
            arrays.append(rgba[:, :, :3])
    a, b = arrays
    masks = {}
    for name, threshold in [('window', 90), ('whiteContent', 200)]:
        aa, bb = a[:, :, 0] > threshold, b[:, :, 0] > threshold
        if not aa.any() or not bb.any():
            raise ValueError('Empty calibration mask: ' + name)
        def box(mask):
            y, x = np.where(mask)
            return [int(x.min()), int(y.min()), int(x.max()), int(y.max())]
        distances = [distance_transform_edt(~aa)[bb], distance_transform_edt(~bb)[aa]]
        masks[name] = {
            'thresholdRed255': threshold, 'browserBoundsPx': box(aa),
            'referenceBoundsPx': box(bb),
            'intersectionOverUnion': float((aa & bb).sum() / (aa | bb).sum()),
            'symmetricMaximumDistancePx': float(max(d.max() for d in distances)),
            'symmetricP99DistancePx': float(max(np.quantile(d, .99) for d in distances)),
        }
    checks = {
        'windowBoundsEqual': masks['window']['browserBoundsPx'] == masks['window']['referenceBoundsPx'],
        'windowIoUAtLeast0995': masks['window']['intersectionOverUnion'] >= .995,
        'allForegroundWithinTwoPixels': all(m['symmetricMaximumDistancePx'] <= 2 for m in masks.values()),
        'contentIoUAtLeast085': masks['whiteContent']['intersectionOverUnion'] >= .85,
    }
    return {
        'allPassed': all(checks.values()), 'checks': checks, 'masks': masks,
        'meanAbsoluteChannelDifference255': float(np.abs(a.astype(float) - b).mean()),
        'inputs': [{'name': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [browser, reference]],
        'method': 'Unaligned, unresampled opaque neutral captures. Fixed thresholds for silhouette registration only.',
        'limits': ['SDF/triangle rasterization and antialiasing differ', 'Not a physical-material or pixel-colour equivalence test', 'Not a headset acceptance test'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser', type=Path)
    parser.add_argument('reference', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.browser, args.reference)
    with args.out.open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps({'allPassed': result['allPassed'], 'checks': result['checks']}))
    if not result['allPassed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
