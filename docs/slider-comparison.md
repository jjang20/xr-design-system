# R01.1 · 공통 화면 밝기와 XR 조작 단서

Q113 수정 계약을 구현한 별도 비교 fixture다. 이전 R01의 독립 값·초기 `.4`·작은 sample만 바꾸는 결과는 대체됐다. `PlanarSlider`는 비교 fixture이며 public DS export가 아니다. 기본 demo와 tokens는 유지한다. Q117 개발 검증 뒤 Q118 사용자가 개선되지 않았다고 보고했다. Q118은 원 웹 데모 Z source를 재사용하고 평면 핸들 획득을 먼저 고친다. 저장된 원 웹 후보51c와2c/3ea의 Z source가 동일함을 대조해 원바이트로 복원했다. 사용자가 과거에 연 exact URL/입력 방식은 미확인이다. 일반 push·detent·재질 값은 원 구현이며 실제 기기 해결은 미확인이다.

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
| X near contact / pinch | 일반 접촉은 기존 crossing/후퇴·깊이·Y 경계를 유지. 획득과 probe 거리 판정은 track 및 현재 보이는 thumb 원판을 포함한다. 접촉 범위에서 시작한 pinch는 opening/loss까지 동일 소유·좌표로 유지하며 접촉 띠 이탈만으로 풀리지 않는다 | installed Three + 합성 joint pose/semantic 입력; 하드웨어 미검증 |
| Z near / semantic ray | 원 웹 Z의 push·선행 hover 후 semantic pinch·ray plane·wheel·detent를 재사용. 원 획득 의미를 바꾸지 않고 fixture가 획득한 mapping의 release/loss를 보호 | frozen51c direct input 대 adapter의 유한 차등 replay; 실제 Quest·모든 ray 각도 미검증 |
| Native joint pinch | X만 opt-in. Z는 원 source와 같이 semantic select를 사용하며 joint-only pinch 획득을 주장하지 않는다. 같은 손 contact→semantic pinch와 다른 source 비탈취는 fixture에서 분리 | installed Three 이벤트 + 합성 getJointPose/getPose; 실제 browser semantic 순서 미확인 |
| 소유권 / reset | 다른 source 비탈취, loss 이후 재무장, 복원 뒤 stale held 차단 | bounded synthetic + desktop restore |

X track 160×32mm, thumb 지름18mm, 앞면3mm와 20mm 깊은 접촉 guard는 기존 fixture 값이다. controller의 grip pose는 grip 버튼이 아니다. near X에 pinch를 요구하지 않는다. 일반 접촉과 명시적 pinch를 모두 지원하되 접촉/잡기의 유지 조건을 분리한다. XR 장면에는 near/far hand/controller 안내를 병기하고 X thumb/track 색·크기로 hover와 획득을 구분한다. 실제 connected XR source의 hand/controller identity와 해당 control의 ray probe가 일치하면 그 안내를 먼저 표시한다. near/unknown은 기본 병기를 유지하며 source를 확신 없이 추정하지 않는다. 이 안내 화면을 무도움 첫 노출 시험으로 취급하지 않는다.

Q116의 pressed 해제 보고 뒤, 실제 InputSystem에 합성 손/컨트롤러 pose를 넣어 held ray가 거리 변화만으로 poke로 바뀌고 capture·pressed·값 갱신을 잃는 경로를 재현했다. `retainRayCapture`를 켠 평면 fixture의 동일 source·ray grab·유효 target만 release frame까지 ray로 보낸다. 이 획득된 ray의 pose가 사라지면 Three의 이전 matrix를 사용하지 않고 owner를 해제하며, 계속 held인 입력은 release 뒤 재획득해야 한다. threshold 확대, native pinch 확대, 실제 loss/reset 보호 제거는 없다. 이 문단과 다음 Q117 설명은 당시 이력이다. Q118의 원 Z 재사용이 Z native-first 부분을 대체했다. Q117은 진단 결과와 최신 사용자 승인에 따라 Z에도 ray 유지 및 두 slider의 near pinch 유지를 추가했다. 해당 opt-in 외 component의 거리 전환은 유지하며, thumb/index tracking loss는 grab을 취소하고 실제 opening/release 뒤 새 획득을 요구한다. 같은 hand의 thumb contact→index pinch는 공통 owner의 sourceId 일치 때만 이어받는다. H4 swell 단독 인과는 채택하지 않아 swell 값·shader·threshold는 변경하지 않았다. 이 재현을 사용자의 실제 입력 모드나 현장 원인으로 확정하지 않는다.

## 공간·lifecycle

Desktop rig `(0,1.48,-.6)`, 양 중심 ±.14m, scale1. Z는 기존 D=.6 계산과 Y회전 -.35rad를 쓴다. XR은 첫 viewer pose 기준 rig를 배치한다. UI 축/hit/reach/자체 Z feedback 차이는 남는다. 실제 공간 센싱·가림·접촉은 구현하지 않는다.

Session 종료와 앱 dispose는 공통값1과 dim 제거를 수행한다. source loss는 session 종료와 달리 값을 유지한다. pagehide도 앱 밝기를 복원하며 BFCache 보존 시 자원은 유지한다. 최종 dispose는 own canvas/geometry/material/texture/renderer를 정리하고 공유 cache는 소유하지 않는다. native session 종료는 요청·비동기 정리 경계이며 하드웨어 종료 증거가 아니다. 기존 retained preview는 이 변경과 별도로 고정되어 있다.

## 개발 검증

`node --import ./test/support/register.mjs --disable-warning=THREE_CJS_DEPRECATED --test test/slider-comparison.test.js test/slider-pinch-continuity.test.js`는 공통 public control/value/visible 결과 및 실제 InputSystem routing을 확인한다. Node DOM/font는 stand-in이고 pixel 증거가 아니다.

`node scripts/verify-slider-brightness.mjs` (`verify-slider-comparison.mjs`도 같은 checker로 연결)는 소유 loopback Vite/설치 Chrome에서 pointer·복원·실제 GL frame/alpha·합성 ArrayCamera viewport와 오류·정리를 확인한다. XR session/POST/성능계측을 하지 않는다. `CHROMIUM_PATH`, `R01_OUTPUT`으로 설치 browser/결과 경로를 지정할 수 있다. paused-loop 캡처는 text sync 뒤 새 frame을 제출해야 한다.

`npm test`는 tokens + Node + Arena, `npm run build`는 tokens + Vite다. 별도 TS typecheck script는 없다. 이 검증은 Quest 동작·passthrough·가독성/comfort·성능 수락을 대신하지 않는다. GPU deferred/auto-resume false, #12 NOT_MET / #13 OPEN 유지.

Q117 당시 획득 경계(현재 X에 적용, Z는 Q118 원 source 복원): actual InputSystem은 native/semantic 신호의 합이 처음 켜진 프레임을 near probe에 전달한다. 유효 hit에서 시작한 pinch 또는 이미 소유한 contact만 pinch drag로 이어진다. 다른 곳에서 집은 채 들어오거나 뒤늦은 semantic 신호가 합쳐져도 새 grab/push를 만들지 않는다. 기존 직접 probe 호출에서 이 선택 필드가 없으면 기존 호출 의미를 유지한다. 실제 기기 이벤트 순서와 해결 여부는 아직 미확인이다.

## Q118 원 웹 재사용와 획득 증거

원51c direct Input→Z와 비교 adapter를 normalized pose 및 각 실제 pose에서 push, semantic pinch, thumb→pinch, far ray, loss의 10쌍/38 frame으로 대조했다. 유한 replay의 public feed 순서·local 좌표·상태와 값이 같았고 정상 획득·유지의 source 및 knob/label/Glow도 같았다. far release의2 frame은 의도적으로 다르다: 원 Input은 pressed=false에도 한 frame captured=true를 보내지만 fixture는 즉시 해제한다. 실제값은 같고, 즉시 해제·비탈취·복원은 Q113 계약이다. 이는 합성 입력이며 원 main 전체 scene 또는 실제 Quest와의 동등성 증명이 아니다.

원 main은 Z 위치(.215,1.53,-.6), lookAt(0,1.6,0) 뒤 rotateY(-.45), 초기.4 및 backdrop 소비자를 썼다. 비교 화면은 위 pose/공통 초기1/전체 dim을 유지한다. 두 실제 matrix와 local→world→local feed 대조를 별도 근거에 남겼다. 원 source byte 복원만으로 재사용 완료를 판단하지 않는다.

평면 endpoint의 보이는 바깥 원판을 실제 ray로 확인한 뒤 public InputSystem의 native pinch·semantic ray·near contact로 획득부터 검사했다. 기존 track 범위만 사용한 hit/거리 판정은 이 원판을 제외했다. 양끝 visible 영역 획득·pressed 진입 후25/75% 이동, 밖의 빈공간 거부, release/loss/비탈취를 구분한다. grabbed 상태 직접 주입을 최초 획득 증거로 쓰지 않는다. 기존 raw red와 Q117 native-only Z 기대는 역사로 보존한다.
