"""Verify pinned inputs and reconstruct canonical WOFF tables as SFNT, offline."""
import argparse, hashlib, json, math, struct, zlib
from pathlib import Path

def sha(b): return hashlib.sha256(b).hexdigest()
def require(condition,message):
    if not condition:raise ValueError(message)

def checksum(data):
    padded=data+b'\0'*((-len(data))%4)
    return sum(struct.unpack('>'+str(len(padded)//4)+'I',padded))&0xffffffff

def unpack_woff(data):
    require(data[:4]==b'wOFF','Expected a WOFF 1.0 font')
    count=struct.unpack_from('>H',data,12)[0]
    tables=[]
    for i in range(count):
        tag,offset,compressed,length,table_checksum=struct.unpack_from('>4sIIII',data,44+20*i)
        b=data[offset:offset+compressed]
        if compressed!=length:b=zlib.decompress(b)
        require(len(b)==length,'Incorrect decompressed table length: '+tag.decode())
        # The head table checksum is specified with checkSumAdjustment zeroed.
        check_bytes=b[:8]+b'\0'*4+b[12:] if tag==b'head' else b
        require(checksum(check_bytes)==table_checksum,'Incorrect original table checksum: '+tag.decode())
        tables.append((tag,b,table_checksum))
    return data[4:8],tables

def sfnt(flavor,tables):
    tables=sorted(tables);n=len(tables);power=2**int(math.log2(n))
    header=flavor+struct.pack('>HHHH',n,power*16,int(math.log2(power)),n*16-power*16)
    directory={};body=b'';offset=12+16*n
    # WOFF does not retain original SFNT offsets. For these pinned Inter fonts,
    # ascending padded table length produces a checksum-compatible deterministic
    # packing while preserving *all* table bytes, including head.checkSumAdjustment.
    # This is not a claim to reconstruct the font producer's original byte order.
    physical_order=sorted(tables,key=lambda record:((len(record[1])+3)//4,record[0]))
    for tag,b,table_checksum in physical_order:
        directory[tag]=struct.pack('>4sIII',tag,table_checksum,offset,len(b))
        padded=b+b'\0'*((-len(b))%4);body+=padded;offset+=len(padded)
    result=header+b''.join(directory[tag] for tag in sorted(directory))+body
    require(checksum(result)==0xb1b0afba,
            'No checksum-compatible packing for this pinned font; never alter head table bytes implicitly')
    return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--baseline',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args()
    a.out.mkdir(parents=True,exist_ok=False)
    manifest=json.loads((a.baseline/'manifest.json').read_text());contract=(a.baseline/'comparison-contract.json').read_bytes()
    require(sha(contract)==manifest['comparisonContractSha256'],'Comparison contract hash mismatch')
    for e in manifest['trackedInputs']+manifest['externalAssets']:
        b=(a.source/e['path']).read_bytes();require(len(b)==e['bytes'] and sha(b)==e['sha256'],e['path'])
    (a.out/'contract.json').write_bytes(contract)
    assets=[];fonts=[]
    def put(path,data):
        p=a.out/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);assets.append({'path':path,'sha256':sha(data),'bytes':len(data)})
    for weight in [400,500,600,700]:
        data=(a.source/f'node_modules/@fontsource/inter/files/inter-latin-{weight}-normal.woff').read_bytes();flavor,tables=unpack_woff(data);ttf=sfnt(flavor,tables)
        # Reparse the output independently and compare every decompressed table byte.
        parsed={}
        for i in range(len(tables)):
            tag,table_checksum,offset,size=struct.unpack_from('>4sIII',ttf,12+16*i);parsed[tag]=ttf[offset:offset+size]
        require(all(parsed[tag]==b for tag,b,_ in tables),'SFNT conversion changed a canonical table')
        upem=struct.unpack_from('>H',parsed[b'head'],18)[0]
        path=f'fonts/inter-{weight}.ttf';put(path,ttf)
        fonts.append({'id':f'inter-{weight}','path':path,'weight':weight,'sha256':sha(ttf),'woffSha256':sha(data),'unitsPerEm':upem,'canonicalTablesPreserved':True,'tableHashes':{tag.decode():sha(b) for tag,b,_ in tables},'sfntChecksum':'0x%08x'%checksum(ttf),'sfntChecksumValid':True,'sfntTableLayout':'ascending padded table length then tag; directory sorted by tag','rendererFontMode':'glyph meshes shaped from canonical WOFF; derived SFNT is independently verified provenance'})
    c=json.loads(contract)
    for name in c['assetPolicy']['glyphs']:put(f'icons/{name}.svg',(a.source/f'node_modules/lucide-static/icons/{name}.svg').read_bytes())
    put('env/lebombo_1k.hdr',(a.source/'demo/public/env/lebombo_1k.hdr').read_bytes())
    put('licenses/Inter-LICENSE',(a.source/'node_modules/@fontsource/inter/LICENSE').read_bytes())
    put('licenses/Lucide-LICENSE',(a.source/'node_modules/lucide-static/LICENSE').read_bytes())
    (a.out/'assets.json').write_text(json.dumps({'sourceSha':manifest['sourceSha'],'contractSha256':sha(contract),'inputDigest':manifest['inputDigest'],'fonts':fonts,'assets':assets},indent=2))
    print(json.dumps({'verifiedInputs':len(manifest['trackedInputs'])+len(manifest['externalAssets']),'fontWeights':len(fonts),'tablesPreserved':True,'sfntChecksumsPassed':all(f['sfntChecksumValid'] for f in fonts),'assetCount':len(assets)}))

if __name__=='__main__': main()
