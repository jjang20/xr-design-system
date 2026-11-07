# R02 — matched gradual resize fixture

별도 `/window-resize-comparison.html`. 평면/Contour의 live q는 독립이며 같은 불변 Item01–08, title Items, subtitle Resize preview를 사용한다. 내용은 읽기 전용이다. title/edge 이동·선택/열림·scroll·distance 재평가·live-head scaling은 없다. fixture는 public DS export가 아니며 원 demo/src/tokens/R01 entry 의미를 바꾸지 않는다.

## 결과와 조건

Q115의 공통 gradual 정책을 따른다. q[1,22/15], 초기1, g=q^.6은 이번 engineering 시안이다. 최종 DS 계수/최적값/읽힘 최소값이 아니다. W0=.216m,H0=.28935m,pitch0=.0432m,title=.0189m,subtitle=.01116m; 기존 D=.6 layout 입력에서 나온 metric이며 실측 eye distance가 아니다.

stable local pane/handle geometry와 root1.5q를 유지한다. noninteractive content node만 g/q를 적용해 world font/pitch가 g로 증가한다. 두께/corner/hit은 기존 outer transform을 따르며 content 함수가 정한 물성 규칙이 아니다. q 계산은 최초 capture matrix/position/axis/q를 고정해 누적 확대를 피한다. NaN/Infinity size는 적용하지 않고 유한값만 clamp한다. 기존 WindowControls의 전체 이동/scaleRange 계약을 바꾸지 않고 fixture adapter에서 resize-only 범위를 구현했다.

Troika 실제 text sync 후 blockBounds와 row rectangle, viewport를 함께 검사한다. 준비 전에는 fullVisibleIds를 확정하지 않는다. 전체 rect/glyph가 들어가는 행만 visible; 부분행/수평 overflow는 full count에 넣지 않는다. `result`에 viewport, 각 row rect/glyph,fullVisibleIds/hiddenIds,headerFits,textReady,horizontalOverflow가 있다. bounds는 content-local m이며 world길이 배율1.5g. 이 값은 실제 정보 이해/가독성의 판정이 아니다.

## 입력·capture

| 경로 | 구현/한계 |
|---|---|
| Desktop / semantic ray | 실제 InputSystem hit→select capture→고정 시작 frame drag. acquired ray는 Q116 opt-in을 재사용해 가까워짐만으로 poke로 바뀌지 않는다. 실제 pose loss/reset은 해제·held 재무장 차단. wheel로 resize하지 않는다. |
| Near hand / controller pose | 기존 corner의 semantic pinch/trigger 신호와 표면 reach로 획득. grip pose는 grip 버튼이 아니다. 획득 후 기존 retainPokeCapture에 연결해 거리만으로 ray로 전환하지 않으며 실제 loss/release guard는 유지한다. actual InputSystem poke를 합성해 검증한다. |
| Native joint pinch | Q117의 pane/slider opt-in fallback을 이 corner에 확장하지 않는다. browser semantic select 지원과 실제기기 경험은 미확인. |
| 소유권 | 창마다 source/handle 하나. 같은 source 동시 두 창 소유 차단, 독립 source의 두 창 조작 허용. 기존 owner 우선, 비소유 held 입력은 소유권을 빼앗거나 loss 직후 승계하지 않는다. |
| Release/loss/reset | release/loss는 마지막 size 유지, owner/임시feedback만 해제. source loss 뒤 release가 있어야 rearm. fixture는 hit 없는 공간의 실제 pointerup/semantic selectend도 연결하며, 그 source만 재무장한다. 두 frame 사이의 빠른 release→press도 실제 release event로 reset latch/fixture capture를 해제하며 unrelated click 경로는 유지한다. pointercancel/pose loss/reset은 release로 간주하지 않는다. Reset size는 양 q1·content 복원과 입력 reset. 새 XR의 첫 유효 viewer pose와 session 종료/page 전환은 size1로 초기화, dispose는 소유자원 정리. |

Contour는 기존 BubbleHandle 32dmm corner sphere/arrow/SoftControl feedback을 재사용한다. 평면은 같은 local 폭의 사각 handle/arrow/색 피드백이며 shape/hit envelope 차이는 남는다. title/rows는 input targets가 아니다. 일반 PackagingPanel/WindowControls의 이동과 navigation은 이 entry에 들어오지 않는다. 새 native 권한이나 입력지원 확대 주장은 없다.

## 배치·안내

두 중심 x±.23m. 원 제안±.19m에서 상한 corner 돌출이 중앙 간격을 잠식하여 대칭 간격만 확장했다. baseline/상한 bounds를 별도 확인한다. rig desktop (0,1.48,-.68), XR 첫 viewer yaw 기준 (0,-.12,-.68), 이후 head 이동에 재계산하지 않는다. reference frame일 뿐 실물등록/접촉/가림이 아니다.

창 외부 동일크기 Flat window/Contour window label, XR내 `Corner: pinch / hold trigger, then drag`와 release/read-only 안내, Reset size가 있다. header 안내 뒤 경험은 무도움 첫노출로 해석하지 않는다. guide/footer는 상한 corner와 겹치지 않게 y-.275/reset-.34에 둔다. 새 환경밝기 기능0. glass는 기존 authored RoomEnvironment/기존 backdrop API를 재사용하고 MR에 실방 샘플을 주장하지 않는다.

## 검증 범위

`test/window-resize-comparison.test.js`: 실제 InputSystem ray/poke와 controls→visible dimensions/state, stable capture/경쟁/loss/reset/동일결과/비입력내용. Node font stand-in으로 실제 row fit를 증명하지 않는다.

`node scripts/verify-window-resize.mjs`: 소유 random-loopback Vite/설치 Chrome의 실제 pointer·GL·text layout. baseline5→상한6 whole row, 같은 q metric/fit, 독립 resize, 복원/loss·빈 공간에서 놓은 뒤 새 drag/오류/cleanup. `R02_OUTPUT`, `CHROMIUM_PATH` 지원. 새 XR session/POST/성능수집0. GPU deferred/auto-resume false,#12 NOT_MET,#13 OPEN. 실제 Quest 입력/가독성·comfort는 별도 확인이다.
