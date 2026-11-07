# R01.1 · 공통 화면 밝기와 XR 조작 단서

Q113 수정 계약을 구현한 별도 비교 fixture다. 이전 R01의 독립 값·초기 `.4`·작은 sample만 바꾸는 결과는 대체됐다. `PlanarSlider`는 비교 fixture이며 public DS export가 아니다. 기본 demo와 tokens, 기존 ZSlider 동작은 유지한다. Q116 후속은 InputSystem에 평면 fixture의 획득된 ray drag를 유지하는 opt-in만 추가한다.

`npm run dev` 후 `/slider-comparison.html`을 연다. 자동 XR 진입·수집·업로드는 없다. 초기 공통값 `b=1`; 둘 중 하나를 조절하면 두 control/숫자와 화면 밝기가 함께 변한다. HTML과 XR 장면에 `밝기 복원`이 있다.

## 값·소유권·복원

- 연속 `[0,1]` 하나를 공유하며 숫자만 `Math.round(b*100)%`로 표시한다. 한 source/control이 조작 중 공통 결과를 소유한다. 기존 owner가 우선이며 동시 acquisition은 source ID, control key의 안정된 순서로 중재한다. 서로 다른 control의 update 순서로 마지막 값이 이기지 않는다.
- 경쟁 중 held 입력은 release/withdrawal 뒤 새 acquisition이 필요하다. owner loss/release는 마지막 값을 유지한다. 복원은 owner를 해제하고 `b=1`로 돌아가며 아직 held인 입력을 막는다. live handoff나 모든 입력 전환의 경험 등가를 주장하지 않는다.
- 실제 control `change`를 공통 상태에 반영하고 반대 control은 무음 mirror로 갱신한다. 기존 Z의 silent setter가 detent를 발생시킬 수 있어 fixture의 Z subclass가 mirror 동안 이벤트를 억제한다. 직접 Z 조작의 detent·Glow·음향 의미는 바꾸지 않는다. silent 외부 setter는 사용자 commit 경로가 아니다.
- 동일 숫자는 로컬 Inter/Troika 경로, Hangul 안내는 로컬 system-font canvas다. text geometry는 비동기 동기화된다. 중립 sample은 고정 linear RGB `.7`이며 최종 dim을 함께 받는다. 별도 brightness 결과가 아니다.

## 전체 화면 합성

마지막 검정 transparent draw의 `alpha=.75*(1-b)`로 가상 scene·unlit/custom 재질·숫자·안내·control을 함께 감쇠한다. desktop HTML 내용은 대응 CSS filter를 적용하고 canvas에는 중복 적용하지 않는다. `b=0`도 완전 검정은 아니다. 이 값은 fixture 상한이며 가독성, 물리 광도/nits, 지각 선형성 보장이 아니다. 배경·HDR·조명 값이나 시스템 밝기를 바꾸지 않는다.

실제 `XRSession.environmentBlendMode`를 읽어 HTML과 XR 안에 범위를 표시한다. `alpha-blend`는 투명 영역의 alpha를 통한 표시 passthrough 감쇠 후보이며, camera 접근이나 실제 방 조명 변경이 아니다. `opaque`는 가상 앱 화면만, `additive`/unknown은 `가상 화면 밝기`로 표시한다. unknown을 alpha-blend로 추정하지 않는다. 실제 Quest 합성은 아직 미검증이다.

Dim은 각 camera viewport의 clip-space draw이며 input/depth/occlusion target이 아니다. 별도 per-eye 수동 render나 renderer 설정 전역 변경을 추가하지 않는다. 실제 GL 검사는 합성된 두 viewport의 alpha·영역을 확인하며 실제 XR compositor 검사가 아니다.

## 입력 경계

| 경로 | 동작·한계 | 근거 |
|---|---|---|
| X semantic ray / desktop | track/thumb에서 select/trigger를 유지해 가로 drag. XR 획득 후 근거리로 들어와도 같은 ray mapping 유지; 실제 release/loss는 해제. hover와 release frame은 값 불변. 평행 ray는 값 유지 | 실제 InputSystem 합성 routing·기존 desktop pointer; 새 거리 전환은 합성 근거 |
| X near | 앞면 contact crossing에서 획득 후 가로 drag. world radius/local scale 적용. 최초 뒤쪽 출현·radius 증가만으로 획득하지 않음. 후퇴/깊은 관통/Y 밖/loss는 해제 | 합성 InputSystem/probe; 하드웨어 미검증 |
| Z near / semantic ray | 기존 push·semantic pinch pull·ray plane·wheel·detent를 보존. ray plane 교차 불가 시 기존 last-point fallback 한계 유지 | 기존 public probe 회귀, desktop wheel/drag 근거; 모든 ray 각도/Quest 미검증 |
| Native joint pinch | 기존 pane 전용 fallback을 slider에 확장하지 않음 | 새 native slider 지원 주장 없음 |
| 소유권 / reset | 다른 source 비탈취, loss 이후 재무장, 복원 뒤 stale held 차단 | bounded synthetic + desktop restore |

X track 160×32mm, thumb 지름18mm, 앞면3mm와 20mm 깊은 접촉 guard는 기존 fixture 값이다. controller의 grip pose는 grip 버튼이 아니다. near X에 pinch를 요구하지 않는다. XR 장면에는 near/far hand/controller 안내를 병기하고 X thumb/track 색·크기로 hover와 획득을 구분한다. 실제 connected XR source의 hand/controller identity와 해당 control의 ray probe가 일치하면 그 안내를 먼저 표시한다. near/unknown은 기본 병기를 유지하며 source를 확신 없이 추정하지 않는다. 이 안내 화면을 무도움 첫 노출 시험으로 취급하지 않는다.

Q116의 pressed 해제 보고 뒤, 실제 InputSystem에 합성 손/컨트롤러 pose를 넣어 held ray가 거리 변화만으로 poke로 바뀌고 capture·pressed·값 갱신을 잃는 경로를 재현했다. `retainRayCapture`를 켠 평면 fixture의 동일 source·ray grab·유효 target만 release frame까지 ray로 보낸다. 이 획득된 ray의 pose가 사라지면 Three의 이전 matrix를 사용하지 않고 owner를 해제하며, 계속 held인 입력은 release 뒤 재획득해야 한다. threshold 확대, native pinch 확대, 실제 loss/reset 보호 제거는 없다. 다른 component의 기존 자동 거리 전환은 유지한다. 이 재현을 사용자의 실제 입력 모드나 현장 원인으로 확정하지 않는다.

## 공간·lifecycle

Desktop rig `(0,1.48,-.6)`, 양 중심 ±.14m, scale1. Z는 기존 D=.6 계산과 Y회전 -.35rad를 쓴다. XR은 첫 viewer pose 기준 rig를 배치한다. UI 축/hit/reach/자체 Z feedback 차이는 남는다. 실제 공간 센싱·가림·접촉은 구현하지 않는다.

Session 종료와 앱 dispose는 공통값1과 dim 제거를 수행한다. source loss는 session 종료와 달리 값을 유지한다. pagehide도 앱 밝기를 복원하며 BFCache 보존 시 자원은 유지한다. 최종 dispose는 own canvas/geometry/material/texture/renderer를 정리하고 공유 cache는 소유하지 않는다. native session 종료는 요청·비동기 정리 경계이며 하드웨어 종료 증거가 아니다. 기존 retained preview는 이 변경과 별도로 고정되어 있다.

## 개발 검증

`node --import ./test/support/register.mjs --disable-warning=THREE_CJS_DEPRECATED --test test/slider-comparison.test.js`는 공통 public control/value/visible 결과 및 실제 InputSystem routing을 확인한다. Node DOM/font는 stand-in이고 pixel 증거가 아니다.

`node scripts/verify-slider-brightness.mjs` (`verify-slider-comparison.mjs`도 같은 checker로 연결)는 소유 loopback Vite/설치 Chrome에서 pointer·복원·실제 GL frame/alpha·합성 ArrayCamera viewport와 오류·정리를 확인한다. XR session/POST/성능계측을 하지 않는다. `CHROMIUM_PATH`, `R01_OUTPUT`으로 설치 browser/결과 경로를 지정할 수 있다. paused-loop 캡처는 text sync 뒤 새 frame을 제출해야 한다.

`npm test`는 tokens + Node + Arena, `npm run build`는 tokens + Vite다. 별도 TS typecheck script는 없다. 이 검증은 Quest 동작·passthrough·가독성/comfort·성능 수락을 대신하지 않는다. GPU deferred/auto-resume false, #12 NOT_MET / #13 OPEN 유지.
