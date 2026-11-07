# R01 · 숫자 + 가상 밝기 샘플

Q112의 선택을 구현한 별도 비교 후보다. 기본 demo, B51 tokens/InputSystem/ZSlider/shader를 수정하지 않는다. `demo/comparison/PlanarSlider.js`는 fixture이며 public DS export가 아니다.

`npm run dev` 후 `/slider-comparison.html`을 연다. 빌드에도 별도 entry가 포함된다. 두 control은 자유 순서로 조작하며 각 값은 독립이다. 초기 `.4`와 배치 거리는 fixture 값이다. 자동 reset이나 과업 순서, 지속 selected, 새 slider token은 없다.

## 값과 공통 결과

- 두 control은 연속 `[0,1]`, 표시만 반올림한 `0–100%`. 같은 raw 값에서 같은 RGB parameter와 숫자를 낸다. 같은 정수 표시라도 raw 값이 다르면 sample parameter가 다르다.
- 매 update에 control의 공개 `value`를 읽는다. `change`는 control의 원래 이벤트이며 결과에서 control로 재주입하지 않는다. silent 초기화/프로그램 설정도 같은 결과 경로를 쓴다. ZSlider의 silent detent는 보존하며 실행 확정으로 해석하지 않는다.
- sample은 양쪽 모두 75×75mm 불투명 MeshBasicMaterial, `toneMapped:false`, linear RGB `(v,v,v)`를 동일 renderer 색관리로 표시한다. 조명/HDR/backdrop/다른 control에 영향을 주지 않는다. 물리 luminance, 지각적 선형성, 동일 픽셀 밝기를 뜻하지 않는다.
- 공통 `밝기`는 로컬 system font canvas, 공통 숫자는 기존 로컬 Inter/Troika 경로다. 최초 text geometry sync 후 준비 완료한다. 이후 숫자 갱신에도 비동기 text sync가 필요하다. Hangul/Latin 가독성의 사용자 수락은 별도다.

## 입력 경계와 지원 근거

| 경로 | 현재 동작 / 보존 경계 | 확인 범위 |
|---|---|---|
| X desktop / semantic ray | track/thumb hit 후 press로 acquire. track 앞 평면의 local X로 이동·clamp. hover/놓는 프레임은 값 변경 없음. owner만 drag. 평행/동일 평면 ray는 값 유지. source loss 시 값 유지·owner 해제, 같은 ray는 release 후 재획득 | 실제 InputSystem 합성 routing + 실제 desktop pointer. Quest 미검증 |
| X near hand / controller pose | 앞면을 움직여 접촉하는 관측 crossing에서만 acquire. world radius를 local scale로 변환. 최초 뒤쪽 출현·radius 증가만으로 획득하지 않음. drag 중 X 밖은 clamp, Y 밖/깊은 관통/후퇴/loss는 해제·값 유지 | 실제 InputSystem 합성 routing/scale 검사. hand/controller 실기기 미검증. controller grip pose는 grip 버튼 아님 |
| Z near push / semantic pinch | 기존 front push 및 near hover에서 semantic select/pinch capture pull 보존 | public probe 회귀. 새 Quest 확인 없음 |
| Z semantic ray / desktop wheel | 기존 knob hit, horizontal local-Y plane capture, wheel·detent·Glow·value label 보존. 평면 교차가 없을 때 InputSystem의 last-point fallback도 기존 그대로 | 실제 desktop wheel/drag. controller/hand far 하드웨어 및 모든 ray 각도 미검증 |
| Native joint pinch | 기존 InputSystem의 pane 전용 fallback을 sliders에 확장하지 않음 | 이 비교에서 slider 지원으로 주장하지 않음 |
| Loss / 입력 전환 | 값 복원과 feedback rest 복귀는 별개. X owner 해제 후 fresh acquire, Z 기존 loss 동작 보존. live handoff/입력 등가/comfort 미확인 | bounded synthetic + desktop. 전체 입력 전환 matrix 미검증 |

X track 160×32mm, thumb 지름18mm, 앞면3mm. contact가 20mm보다 깊이 들어가면 해제하는 fixture guard, 후퇴는 기존 release token. 인접 control의 hit가 겹치지 않게 배치했다. 이것은 새로운 DS 최소 target/접촉 규범이 아니다. sample/label은 input target이 아니다.

## 공간·환경 한계

Desktop 기준 눈높이1.6m, rig `(0,1.48,-.6)`, 좌우 중심 ±.14m, scale1. 공통 sample/label은 같은 깊이·크기·foreground다. Z는 기존 D=.6 크기 계산을 쓰고 Y축 -0.35rad만 기울인다. X/Z 조절축, hit, reach, Z의 추가 자체 값 label/feedback은 남는 차이다. 실제 눈-각 control 거리는 약.628m이며 `.6`을 정확한 눈 거리로 주장하지 않는다.

XR entry는 기존 InputSystem으로 연결하고 첫 viewer pose 기준 같은 rig를 배치한다. AR은 배경 투명, VR/desktop은 같은 가상 배경이다. 가상 reflection 환경은 고정이며 기존 custom glass의 `setBackdrop`으로 연결하고 AR에서는 원래처럼 null로 전환한다. sample 값과 연결되지 않는다. 실제 방/책상 센싱·접촉·가림은 구현하지 않았다. XR entry/종료/첫 pose 배치는 하드웨어 미확인이다.

새 motion은 없으며 기존 Z feedback을 바꾸지 않는다. Reduced preference에서 결과 유지와 기존 feedback은 전체 reduced-motion 적합성/기기 comfort 증거가 아니다. 물성 이해·첫 예측을 평가할 때 이 개발 화면의 조작 설명을 참가자 안내로 자동 채택하지 않는다.

## 개발 검증

`node --import ./test/support/register.mjs --disable-warning=THREE_CJS_DEPRECATED --test test/slider-comparison.test.js`는 실제 control/value/외부 결과를 확인한다. Node는 font/image/DOM 경계 stand-in이며 pixel 검사가 아니다.

`node scripts/verify-slider-comparison.mjs`는 별도 소유 Vite/Chromium에서 font-ready 표시, 실제 pointer hover/drag, Z wheel/drag, 독립 결과, reduced preference 값 유지, console/network와 disposal을 확인한 뒤 브라우저/서버를 닫는다. `CHROMIUM_PATH`와 `R01_OUTPUT`으로 설치된 browser와 결과 경로만 지정할 수 있다. 설치·XR session·GPU 시간 계측·진단 업로드는 하지 않는다. 기본 출력 `shots/r01`은 Git 제외다.

Fixture의 pointercancel/lostpointercapture adapter는 mouse ownership만 해제하고 값을 유지한다. 기존 InputSystem 소스는 보존한다. BFCache용 persisted pagehide에는 scene을 보존하고 최종 dispose에는 instance halo/label texture와 geometry/material/renderer를 정리한다. shared texture cache는 소유하지 않는다. 명시 dispose는 활성 XR session 종료를 요청하며 늦은 session 결과도 종료하지만 native 완료는 실기기 증거가 아니다.

`npm test`는 token 검사 + Node + Arena, `npm run build`는 token 검사 + Vite build다. 독립 TS typecheck script는 없다. 이 근거는 Q112 비교 후보의 기술 검증이며 사용자 적응/Quest/성능 PASS가 아니다. GPU 후속은 계속 보류하고 #12 NOT_MET / #13 OPEN을 유지한다.
