// hashell 총무 앱 셸 (Capacitor Android).
// 앱은 server.url의 Vercel 운영(main) 주소를 WebView로 열 뿐이고, 화면 코드는 저장소 루트의 웹 하나다.
//
// - server.url에는 운영(main) 주소만 쓴다. PR·브랜치 미리보기 주소는 쓰지 않는다.
// - 주소는 비밀이 아니라서 코드에 둔다. 바꾼 뒤에는 `npx cap sync android`로 android/에 반영한다.
// - Capacitor 문서는 server.url을 "운영용이 아니다"라고 한다. 해커톤 시연용이며,
//   스토어 출시 땐 정적 번들로 전환해야 한다 (docs/PLAN.md).
// - 루트의 `tsc`·`next build`도 이 파일을 검사한다 (tsconfig include: **/*.ts).
//   mobile/ 의존성은 루트(CI·Vercel)에 설치되지 않으므로 `@capacitor/cli` 타입을 import하지 않는다.
const config = {
  // Android applicationId가 된다. `npx cap add android` 전에 확정할 것 (android/ 생성 뒤 변경은 번거롭다).
  appId: 'kr.co.mh.hashell',
  appName: 'hashell',
  // 자리표시자 index.html만 있는 폴더. server.url이 있으면 앱은 이 폴더 대신 아래 주소를 연다.
  webDir: 'www',
  server: {
    // TODO: 실제 Vercel 운영(main) 주소로 바꾼다.
    // `.invalid`는 절대 열리지 않는 예약 도메인이라, 안 바꾸면 앱에 연결 오류 화면이 뜬다.
    url: 'https://svc-hackathon-hashell.vercel.app/',
  },
};

export default config;
