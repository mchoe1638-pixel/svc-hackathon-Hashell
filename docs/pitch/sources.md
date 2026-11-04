# 발표 자료 출처 (hashell_pitch.pptx)

2026-11-04에 확인. 숫자를 바꾸면 이 파일과 슬라이드 아래 출처 줄을 같이 고친다.

## 시장·현상 (3장, 11장)

| 숫자 | 내용 | 출처 | 비고 |
| --- | --- | --- | --- |
| 2,955만 명 | 2025년 국민 해외관광객(출국자) | 한국관광공사 2025년 관광통계 발표(2026-01-30) 보도: [헤럴드경제](https://www.heraldk.com/article/2026012918155213361) | 법무부 출입국 통계는 2,957만 5,501명 ([헤럴드경제](https://www.heraldk.com/article/2026012722573312289)). 원자료: [한국관광 데이터랩](https://datalab.visitkorea.or.kr/site/portal/ex/bbs/View.do?cbIdx=1127&bcIdx=310224) |
| 946만 명, +7.3% | 2025년 일본을 찾은 한국인 (945만 9,600명) | [JNTO 2025년 12월 방일 외래객 통계(PDF)](https://asset.japan.travel/image/upload/v1769050010/pdf/Number_of_visitor_arrivals_to_Japan_in_December_2025.pdf), [헤럴드경제](https://www.heraldk.com/article/2026012104453209138) | JNTO 잠정치 |
| 25.1% | 해외여행 동반자가 친구·연인 (가족·친지 58.3%, 혼자 14.3%) | 인천국제공항공사 해외여행 심리조사(2023 여름) 보도: [뉴시스](https://mobile.newsis.com/view/NISX20230719_0002383060) | 국민여행조사의 동반자 통계는 못 찾음. 최근 5년 내 인천공항 출국 경험자 대상 |
| 36.1조 원 | 2025년 해외여행 총 지출액, 역대 최고 (1인 평균 142만 3천 원) | 문화체육관광부 2025 국민여행조사 보도: [경기일보](https://kyeonggi.com/article/20260630580100) | |
| 229억 1천만 달러 | 2025년 거주자 카드 해외 사용액, 사상 최대 (+5.5%) | 한국은행 발표 보도 (검색 요약 기준) | 원문 보도 링크 확인 필요 |

## 문제 근거 (3장)

| 숫자 | 내용 | 출처 | 비고 |
| --- | --- | --- | --- |
| 36% | 단체 여행에서 "늘 공정한 몫보다 더 낸다"고 느낌, 14.8%는 정산 금액으로 다툰 경험 | Kttipay 설문(호주 18~35세 1,000명): [Travel Weekly](https://www.travelweekly.com.au/article/gen-z-the-millennials-say-group-travel-makes-for-awkward-financial-interactions/) | 해외 설문. 국내 설문은 못 찾음 |
| 54% | 친구 여행 다툼 원인 중 돈 문제 (18~24세 71%) | [Starling Bank(영국, 2024)](https://starlingbank.com/news/more-than-half-of-holiday-arguments-stem-from-disagreements-about-money) | 슬라이드에는 안 씀. 질의응답용 |
| +₩9,773, ₩2,017 | 지훈의 n분의 1(₩58,876)과 먹은 만큼(₩49,103) 차이 / ¥10,000의 현금(₩90,500)·카드(₩92,517) 원화 차이 | 시안 `docs/hashell_4.html`의 예시 여행 데이터 | 실제 사례가 아니라 예시 계산. 현금 905원/100엔, TTS 912.4원/100엔은 시안 값. 카드 수수료는 발표에서 1.4% 사용 (아래) |

## 카드 수수료 (3장, 6장)

- 국제브랜드 수수료 약 1.0~1.1%(Visa는 2017년부터 1.1%), 국내 카드사 해외서비스 수수료 약 0.2~0.3%: [카드고릴라](https://www.card-gorilla.com/contents/detail/657), [KB Think](https://kbthink.com/card/overseas-payment-fee.html), [토스피드](https://toss.im/tossfeed/article/traveling-budget-4)
- 발표 자료는 **1.4% = 국제브랜드 약 1.1% + 해외서비스 약 0.3%**(공개 요율 범위의 위쪽)를 쓴다 (3장, 10장)
- **주의**: 시안(`hashell_4.html`의 `fee: 22`)과 `docs/PLAN.md` §7의 기본값은 아직 2.2%다. 그래서 7장 앱 캡처의 카드 지출 원화는 2.2% 기준으로 계산돼 있다. 시안·PLAN도 1.4%로 맞출지 정해야 한다

## 기존 대안 (5장)

| 서비스 | 확인한 것 | 출처 |
| --- | --- | --- |
| Splitwise Itemize | 영수증 사진으로 품목을 각자 고르고 세금·팁을 비율로 나눔. QR로 설치·가입 없이 참여. 미국·영국 먼저, 무료. 한 끼 계산 단위 (2026-10-16 보도) | [The Paypers](https://thepaypers.com/payments/news/splitwise-launches-itemize-receipt-splitting-feature-in-the-us-and-uk) |
| Splitwise simplify debts | 그룹 안 송금 횟수를 줄여 줌 | [Splitwise 도움말](https://splitwise.uservoice.com/knowledgebase/articles/107220-what-does-the-simplify-debts-setting-do) |
| 카카오페이 정산하기 | 카카오톡 안에서 1/N 또는 금액 직접 입력으로 요청, 최대 50명 | [글래스월렛 정리](https://glasswallet.com/calculate/split-bill/kakao-settlement) (2차 자료) |
| 트래블월렛·트래블로그 | 외화 충전·결제 수수료 면제, 회원끼리 외화 송금. 일행 분담 기능은 확인 못 함 | [한경 매거진](https://magazine.hankyung.com/business/article/202302159058b), [카드고릴라](https://m.card-gorilla.com/contents/detail/2931) |

- Splitwise의 외국어 영수증 번역 여부는 확인 못 해서 표에 `?`로 둠
- 토스 정산 기능은 공식 설명을 못 찾아 표에서 뺌

## AI 비용 (9장, 12장)

- Claude Sonnet 5.5: 입력 $2, 출력 $10 / 100만 토큰. Haiku 5.5: 입력 $0.10, 출력 $0.50 (10만 토큰 이하 프롬프트): [Anthropic 가격표](https://platform.claude.com/docs/en/about-claude/pricing)
- 영수증 1장 계산: 입력 약 2,500 토큰(사진 + 프롬프트) × $2 + 출력 약 1,000 토큰 × $10 = 약 $0.015 → 1달러 1,400원이면 약 21원. Haiku 5.5면 약 1원
- 토큰 수와 환율은 가정이다. 실제 영수증 몇 장으로 사용량을 재고 고친다 [확인 필요]. 어떤 모델을 쓸지는 아직 안 정함 (영수증 판독 서버가 아직 없음)

## 팀 상태 (12장)

- `docs/PROGRESS.md` (2026-11-03 기준). 발표 직전에 "됨 / 남음"을 다시 맞춘다
