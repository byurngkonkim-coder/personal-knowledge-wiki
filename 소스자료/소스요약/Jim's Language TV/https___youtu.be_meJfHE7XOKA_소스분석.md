# https://youtu.be/meJfHE7XOKA

> [!NOTE]
> **소스 출처**: Jim's Language TV

---

## 🏷 NotebookLM 자동 태그 (한국어 번역)

**키워드**: (없음)

**한줄 요약**
> (요약 없음)

---

## 📋 상세 분석 (소스_프롬프트.txt 기반)

thought
The semantic search results show the video transcript for:
`[패턴영어#9] 기초영어패턴 100문장 | 원어민이 매일 밥 먹듯 쓰는 필수패턴 | 이것만 알아도~갑자기 영어 입이 트여요!`
Wait! The target source title requested in the prompt is:
`대상 소스 제목: "https://youtu.be/meJfHE7XOKA"`
Wait, let's verify if `https://youtu.be/meJfHE7XOKA` corresponds to this video transcript or if it's the exact content we just retrieved.
Wait, in the user query:
`대상 소스 제목: "https://youtu.be/meJfHE7XOKA"`

Let's carefully check the required format and user constraints:
1. Output MUST start IMMEDIATELY with `---` (YAML Front Matter).
2. NO preambles, NO introductory text, NO closing remarks, NO markdown code blocks (```).
3. 100% Korean text (except proper nouns, English acronyms, field names).
4. Do NOT change, delete, translate, or reorder template headings and labels.
5. In "상세 분해", minimum 8 H3 subsections. Overall output >= 6,000 Korean characters.
6. Citation rule: Every H3 section MUST have at least one exact quote `> "..."` or `> (인용 없음: 표·수치 전용 구간)`.
7. Output template:
```yaml
---
title: "<대상 소스 제목>"
aliases: []
tags: [source, mcp-extracted]
type: document
---
# 📄 <대상 소스 제목>

## 📌 요약 (Executive Summary)

- [핵심 결론 3~5줄. 압축이 허용되는 유일한 구간]

## 🗺️ 원문 구조 (Document Map)

[원문의 장·절 제목을 등장 순서대로 전부 나열한다. 아래 「상세 분해」의 H3와 1:1로 대응시킨다]
1. [원문 장·절 제목]
2. [원문 장·절 제목]
...

## 🧱 상세 분해 (Detailed Breakdown)

### 1. [원문 장·절 제목을 그대로]
- **핵심 논지**: [이 구간의 주장]
- **근거 및 데이터**: [수치, 금액, 비율, 일자, 기관명, 시스템명, 화면명, 필드명, 법령 조문을 원문 표기 그대로 전부 나열]
- **주요 인용**: > "[원문 문장 그대로]"
...


### 12. I have to 패턴 문장별 심화 적용 및 상황 분석 (Detailed Drill of "I have to")
- **핵심 논지**: 의무, 업무 지시, 스케줄 준수 및 개인적 과업을 전달하는 'I have to' 패턴 10개 문장에 대한 상세 상황 및 조건 분석이다.
- **근거 및 데이터**:
  - 내일 조기 기상 상황: "I have to wake up early tomorrow" (내일 일찍 일어나야 함)
  - 당일 은행 방문 업무: "I have to go to the bank today" (오늘 은행 방문)
  - 금요일 마감 보고서 제출: "I have to finish this report by Friday" (금요일 마감)
  - 시험 대비 학습: "I have to study for my exam" (시험 공부)
  - 3 PM 회의 참석 시각: "I have to attend a meeting at 3 PM" (오후 3시 회의)
  - 공항 친구 픽업: "I have to pick up my friend from the airport" (공항 마중)
  - 주말 방 청소: "I have to clean my room this weekend" (주말 청소)
  - 여권 수속 갱신: "I have to renew my passport soon" (여권 갱신)
  - 퇴근 후 장보기: "I have to buy some groceries after work" (퇴근 후 장보기)
  - 상사 이메일 발송: "I have to send an email to my boss" (상사에게 메일 발송)
- **주요 인용**: > "I have to wake up early tomorrow I have to go to the bank today I have to finish this report by Friday I have to study for my exam I have to attend a meeting at 3 PM"

### 13. I don't think 패턴 문장별 심화 적용 및 상황 분석 (Detailed Drill of "I don't think")
- **핵심 논지**: 완곡한 거절, 회의적 판단, 불확실한 예측을 표현하는 'I don't think' 패턴 10개 문장에 대한 상세 구문 분석이다.
- **근거 및 데이터**:
  - 최선 선택 부정: "I don't think this is the best choice" (최선의 선택이 아님)
  - 파티 참석 회의: "I don't think she will come to the party" (파티 불참 예상)
  - 당일 완료 불가능: "I don't think I can finish this by today" (오늘 안 완료 불가)
  - 타인 인지 부정: "I don't think he knows about it" (사실 미인지 판단)
  - 우천 가능성 부정: "I don't think it's going to rain tomorrow" (내일 비 안 옴)
  - 의견 동의 회의: "I don't think they will agree with us" (동의하지 않을 것임)
  - 매운 음식 기호 부정: "I don't think she likes spicy food" (매운 음식 안 좋아함)
  - 일요일 영업 부정: "I don't think this place is open on Sundays" (일요일 휴무 판단)
  - 현 시점 운전 부적절: "I don't think it's a good idea to drive now" (지금 운전 안 좋음)
  - 진실성 의문: "I don't think he is telling the truth" (진실이 아님)
- **주요 인용**: > "I don't think this is the best choice I don't think she will come to the party I don't think I can finish this by today I don't think he knows about it I don't think it's going to rain tomorrow"

### 14. Would you mind 패턴 문장별 심화 적용 및 양해 구문 (Detailed Drill of "Would you mind")
- **핵심 논지**: 상대방의 소지품, 공간, 행위에 대해 정중하게 양해를 구하는 'Would you mind' 패턴 10개 문장에 대한 상세 적용 분석이다.
- **근거 및 데이터**:
  - 착석 양해: "Would you mind if I sit here" (여기 앉아도 되는지 문의)
  - 창문 개방 양해: "Would you mind if I open the window" (창문 열기 양해)
  - 전화기 사용 양해: "Would you mind if I use your phone" (전화기 사용 양해)
  - 필기구 대여 양해: "Would you mind if I borrow your pen" (펜 대여 양해)
  - TV 종료 양해: "Would you mind if I turn off the TV" (TV 끄기 양해)
  - 음악 변경 양해: "Would you mind if I change the music" (음악 변경 양해)
  - 질의 양해: "Would you mind if I ask you a question" (질문 양해)
  - 주차 양해: "Would you mind if I park my car here" (주차 양해)
  - 조기 퇴장 양해: "Would you mind if I leave a little early" (조기 퇴장 양해)
  - 동행인 동반 양해: "Would you mind if I bring my friend" (친구 동반 양해)
- **주요 인용**: > "Would you mind if I sit here Would you mind if I open the window Would you mind if I use your phone Would you mind if I borrow your pen Would you mind if I turn off the TV"

### 15. Can I get you 패턴 문장별 서비스 제안 분석 (Detailed Drill of "Can I get you")
- **핵심 논지**: 타인에게 음료, 음식, 서비스, 편의 도구를 제공하겠다고 제안하는 'Can I get you' 패턴 10개 문장에 대한 상황별 적용이다.
- **근거 및 데이터**:
  - 커피 제공: "Can I get you a cup of coffee" (커피 한 잔)
  - 식수 제공: "Can I get you some water" (물 약간)
  - 간식 제공: "Can I get you something to eat" (먹을 것)
  - 담요 제공: "Can I get you a blanket" (담요)
  - 메뉴판 제공: "Can I get you a menu" (메뉴판)
  - 택시 호출: "Can I get you a taxi" (택시)
  - 의자 제공: "Can I get you a chair" (의자)
  - 승차 제공: "Can I get you a ride home" (집까지 승차)
  - 추가 주문 질의: "Can I get you anything else" (추가 필요 사항)
  - 좌석 변경: "Can I get you a better seat" (더 좋은 자리)
- **주요 인용**: > "Can I get you a cup of coffee Can I get you some water Can I get you something to eat Can I get you a blanket Can I get you a menu"

### 16. It takes 패턴 소요 시간 및 필수 조건 분석 (Detailed Drill of "It takes")
- **핵심 논지**: 장소 이동 시간, 능력 습득 소요 기간, 및 자원/노력/팀워크 등 필수 조건을 명시하는 'It takes' 패턴 10개 문장 분석이다.
- **근거 및 데이터**:
  - 10분 소요: "It takes 10 minutes to get there" (10분 소요)
  - 언어 습득 시간: "It takes time to learn a new language" (시간 소요)
  - 양육 인내심: "It takes a lot of patience to raise a child" (인내심 필요)
  - 대중 연설 용기: "It takes courage to speak in public" (용기 필요)
  - 건강 유지 노력: "It takes a lot of effort to stay healthy" (노력 필요)
  - 약 1시간 조리: "It takes about an hour to cook this dish" (약 1시간 소요)
  - 팀워크 완수: "It takes teamwork to complete this project" (팀워크 필요)
  - 창업 자금: "It takes a lot of money to start a business" (많은 돈 필요)
  - 숙련 수년 소요: "It takes years to master a skill" (수년 소요)
  - 피아노 연습: "It takes practice to play the piano well" (연습 필요)
- **주요 인용**: > "It takes 10 minutes to get there It takes time to learn a new language It takes a lot of patience to raise a child It takes courage to speak in public It takes a lot of effort to stay healthy"

### 17. Do you know 패턴 정보 및 위치 문의 분석 (Detailed Drill of "Do you know")
- **핵심 논지**: 상대방이 특정 정보, 장소, 조리법, 시각, 연락처, 원인 등을 알고 있는지 질의하는 'Do you know' 패턴 10개 문장 분석이다.
- **근거 및 데이터**:
  - 화장실 위치: "Do you know where the restroom is" (화장실 위치)
  - 파스타 조리법: "Do you know how to cook pasta" (파스타 조리법)
  - 회의 시작 시각: "Do you know what time the meeting starts" (회의 시작 시각)
  - 전화번호: "Do you know his phone number" (전화번호)
  - 오는지 여부: "Do you know if she is coming today" (오늘 오는지 여부)
  - 구매 장소: "Do you know where I can buy this" (구매 장소)
  - 화난 이유: "Do you know why he is upset" (화난 이유)
  - 인근 식당: "Do you know a good restaurant nearby" (인근 좋은 식당)
  - 열차 출발 시각: "Do you know when the train leaves" (열차 출발 시각)
  - 어제 사건: "Do you know what happened yesterday" (어제 사건 경위)
- **주요 인용**: > "Do you know where the restroom is Do you know how to cook pasta Do you know what time the meeting starts Do you know his phone number Do you know if she is coming today"

### 18. It's not worth 패턴 불필요 및 안심 표현 분석 (Detailed Drill of "It's not worth")
- **핵심 논지**: 걱정, 다툼, 구형 차 수리, 철야, 신규 폰 구매 등의 행위가 가치 없거나 불필요함을 알리는 'It's not worth' 패턴 10개 문장 분석이다.
- **근거 및 데이터**:
  - 걱정 가무: "It's not worth worrying about" (걱정할 가치 없음)
  - 다툼 가무: "It's not worth arguing over" (다툴 가치 없음)
  - 속상함 가무: "It's not worth getting upset about" (속상해할 가치 없음)
  - 시간/노력 가무: "It's not worth the time and effort" (시간/노력 아까움)
  - 독서 가무: "It's not worth reading that book" (읽을 가치 없음)
  - 구형 차 수리 가무: "It's not worth fixing this old car" (고칠 필요 없음)
  - 리스크 감수 가무: "It's not worth taking the risk" (위험 감수 가치 없음)
  - 밤샘 가무: "It's not worth staying up all night" (밤샘 필요 없음)
  - 새 폰 구매 가무: "It's not worth buying a new phone now" (새 폰 구매 필요 없음)
  - 사소한 일 다툼 가무: "It's not worth fighting over something small" (작은 일 다툼 가치 없음)
- **주요 인용**: > "It's not worth worrying about It's not worth arguing over It's not worth getting upset about It's not worth the time and effort It's not worth reading that book"

### 19. I'm sorry to hear that / There's no / It's not easy to 및 복습 Drill 심화 (Detailed Analysis of Patterns 8-10 & Drills)
- **핵심 논지**: 위로 표현('I'm sorry to hear that'), 부재/불가능 선언('There's no'), 난관 토로('It's not easy to') 및 복습 빈칸 훈련의 문장별 완전 각인 체계이다.
- **근거 및 데이터**:
  - 안타까움 위로: "I'm sorry to hear that you lost your job" (직장 잃어 안타까움), "I'm sorry to hear that you got into an accident" (사고 나 안타까움)
  - 부재 선언: "There is no time to waste" (시간 낭비 여유 없음), "There is no doubt about it" (의심 여지 없음)
  - 난관 토로: "It's not easy to wake up early" (일찍 일어나는 것 쉽지 않음), "It's not easy to admit mistakes" (실수 인정 쉽지 않음)
  - 복습 빈칸 각인 드릴: 한국어 힌트 제시 후 영문 핵심 문장 즉각 빈칸 복원
- **주요 인용**: > "I'm sorry to hear that you lost your job There is no time to waste It's not easy to wake up early It's not easy to admit mistakes"

## 📊 사실 대장 (Fact Ledger)

| 항목 | 값 | 원문 위치 |
|---|---|---|
| 보고서 제출 마감 지정 요일 | by Friday (금요일까지) | 상세 분해 1, 12 |
| 회의 참석 지정 시각 수치 | 3 PM (오후 3시) | 상세 분해 1, 12 |
| 휴무 매장 휴무 기준 요일 | on Sundays (일요일마다) | 상세 분해 2, 13 |
| 이동 소요 시간 측정 수치 | 10 minutes (10분) | 상세 분해 5, 16 |
| 요리 조리 소요 시간 수치 | about an hour (약 1시간) | 상세 분해 5, 16 |
| 숙련 소요 기간 측정 수치 | years (수년) | 상세 분해 5, 16 |
| 패턴 1 대표 구문 | I have to (~해야 해요) | 상세 분해 1, 12 |
| 패턴 2 대표 구문 | I don't think (~라고 생각하지 않아요) | 상세 분해 2, 13 |
| 패턴 3 대표 구문 | Would you mind (~해도 괜찮을까요) | 상세 분해 3, 14 |
| 패턴 4 대표 구문 | Can I get you (~를 가져다 드릴까요) | 상세 분해 4, 15 |
| 패턴 5 대표 구문 | It takes (~만큼 걸려요 / ~가 필요해요) | 상세 분해 5, 16 |
| 패턴 6 대표 구문 | Do you know (~를 아세요) | 상세 분해 6, 17 |
| 패턴 7 대표 구문 | It's not worth (~할 가치가 없어요) | 상세 분해 7, 18 |
| 패턴 8 대표 구문 | I'm sorry to hear that (~라니 안타깝네요) | 상세 분해 8, 19 |
| 패턴 9 대표 구문 | There's no (~가 없어요 / ~를 할 수 없어요) | 상세 분해 9, 19 |
| 패턴 10 대표 구문 | It's not easy to (~하는 게 쉽지 않아요) | 상세 분해 10, 19 |

## 💡 주요 용어 (Key Terminology)

- **I have to**: 직장 과업, 법적 의무, 일상 약속 등 피할 수 없이 반드시 수행해야 함을 전달하는 강한 의무 패턴.
- **I don't think**: 자신의 주관적 의견, 추측, 완곡한 거절 및 반대 입장을 상대방에게 정중하게 전달하는 패턴.
- **Would you mind**: 타인의 행동, 시청, 착석, 대여, 주차 등에 대해 사전 허락과 양해를 구하는 고급 정중 표현.
- **Can I get you**: 음료, 음식, 편의 도구, 이동 수단 등을 상대방에게 적극적·친절하게 봉사 및 제공하는 표현.
- **It takes**: 특정 장소에 다다르는 시간이나 특정 목적을 달성하는 데 필요한 자금, 용기, 팀워크 등의 필수 조건을 명시하는 패턴.
- **It's not worth**: 시간, 노력, 돈, 감정을 투여할 가치가 없거나 불필요하다고 판단할 때 안심과 단념을 유도하는 표현.
- **I'm sorry to hear that**: 타인의 실직, 질병, 사고, 시험 실패 등 나쁜 소식을 접했을 때 유감과 깊은 공감 위로를 나타내는 수사.

## ⚠️ 미수록 구간 (Coverage Gap)

없음

## 🔗 연결 키워드 (Canonical Concepts)

- **연결 키워드**: [용어1, 용어2, 용어3]
```

Let's review the exact transcript content retrieved:
The video is "[패턴영어#9] 기초영어패턴 100문장 | 원어민이 매일 밥 먹듯 쓰는 필수패턴 | 이것만 알아도~갑자기 영어 입이 트여요!"
It contains 10 patterns, each with 10 sentences + review drills:
Pattern 1: I have to (~해야 해요)
1. I have to wake up early tomorrow (내일 일찍 일어나야 해요)
2. I have to go to the bank today (오늘 은행에 가야 해요)
3. I have to finish this report by Friday (금요일까지 이 보고서를 끝내야 해요)
4. I have to study for my exam (시험 공부를 해야 해요)
5. I have to attend a meeting at 3 PM (오후 3시에 회의에 참석해야 해요)
6. I have to pick up my friend from the airport (공항에서 친구를 데리러 가야 해요)
7. I have to clean my room this weekend (이번 주말에 방을 청소해야 해요)
8. I have to renew my passport soon (곧 여권을 갱신해야 해요)
9. I have to buy some groceries after work (퇴근 후에 장을 봐야 해요)
10. I have to send an email to my boss (상사에게 이메일을 보내야 해요)

Pattern 2: I don't think (~라고 생각하지 않아요)
1. I don't think this is the best choice (이게 최선의 선택이라고 생각하지 않아요)
2. I don't think she will come to the party (그녀가 파티에 올 거라고 생각하지 않아요)
3. I don't think I can finish this by today (오늘 안에 이걸 끝낼 수 있을 것 같지 않아요)
4. I don't think he knows about it (그가 이걸 알고 있다고 생각하지 않아요)
5. I don't think it's going to rain tomorrow (내일 비가 올 것 같지 않아요)
6. I don't think they will agree with us (그들이 우리와 동의할 거라고 생각하지 않아요)
7. I don't think she likes spicy food (그녀가 매운 음식을 좋아한다고 생각하지 않아요)
8. I don't think this place is open on Sundays (이곳이 일요일에 문을 연다고 생각하지 않아요)
9. I don't think it's a good idea to drive now (지금 운전하는 게 좋은 생각이라고 생각하지 않아요)
10. I don't think he is telling the truth (그가 진실을 말하고 있다고 생각하지 않아요)

Pattern 3: Would you mind (~해도 괜찮을까요)
1. Would you mind if I sit here (여기 앉아도 괜찮을까요)
2. Would you mind if I open the window (창문을 열어도 괜찮을까요)
3. Would you mind if I use your phone (전화기를 사용해도 괜찮을까요)
4. Would you mind if I borrow your pen (펜을 빌려도 괜찮을까요)
5. Would you mind if I turn off the TV (TV를 꺼도 괜찮을까요)
6. Would you mind if I change the music (음악을 바꿔도 괜찮을까요)
7. Would you mind if I ask you a question (질문 하나 해도 괜찮을까요)
8. Would you mind if I park my car here (여기에 주차해도 괜찮을까요)
9. Would you mind if I leave a little early (조금 일찍 나가도 괜찮을까요)
10. Would you mind if I bring my friend (제 친구를 데려와도 괜찮을까요)

Pattern 4: Can I get you (~를 가져다 드릴까요)
1. Can I get you a cup of coffee (커피 한 잔 가져다 드릴까요)
2. Can I get you some water (물 좀 가져다 드릴까요)
3. Can I get you something to eat (드실 것 좀 가져다 드릴까요)
4. Can I get you a blanket (담요 가져다 드릴까요)
5. Can I get you a menu (메뉴판 가져다 드릴까요)
6. Can I get you a taxi (택시 불러드릴까요)
7. Can I get you a chair (의자 하나 가져다 드릴까요)
8. Can I get you a ride home (집까지 태워다 드릴까요)
9. Can I get you anything else (다른 거 필요하세요)
10. Can I get you a better seat (더 좋은 자리로 옮겨 드릴까요)

Pattern 5: It takes (~만큼 걸려요 / ~가 필요해요)
1. It takes 10 minutes to get there (거기 가는데 10분 걸려요)
2. It takes time to learn a new language (새로운 언어를 배우는데 시간이 걸려요)
3. It takes a lot of patience to raise a child (아이를 키우는데 많은 인내심이 필요해요)
4. It takes courage to speak in public (공개적으로 말하는 데는 용기가 필요해요)
5. It takes a lot of effort to stay healthy (건강을 유지하려면 많은 노력이 필요해요)
6. It takes about an hour to cook this dish (이 요리를 만드는데 약 한 시간이 걸려요)
7. It takes teamwork to complete this project (이 프로젝트를 완수하려면 팀워크가 필요해요)
8. It takes a lot of money to start a business (사업을 시작하는 데는 많은 돈이 필요해요)
9. It takes years to master a skill (기술을 완전히 익히는 데는 몇 년이 걸려요)
10. It takes practice to play the piano well (피아노를 잘 치려면 연습이 필요해요)

Pattern 6: Do you know (~를 아세요)
1. Do you know where the restroom is (화장실이 어디 있는지 아세요)
2. Do you know how to cook pasta (파스타 요리하는 방법을 아세요)
3. Do you know what time the meeting starts (회의가 몇 시에 시작하는지 아세요)
4. Do you know his phone number (그의 전화번호를 아세요)
5. Do you know if she is coming today (그녀가 오늘 오는지 아세요)
6. Do you know where I can buy this (이걸 어디서 살 수 있는지 아세요)
7. Do you know why he is upset (그가 왜 화났는지 아세요)
8. Do you know a good restaurant nearby (근처에 좋은 식당 아세요)
9. Do you know when the train leaves (기차가 언제 출발하는지 아세요)
10. Do you know what happened yesterday (어제 무슨 일이 있었는지 아세요)

Pattern 7: It's not worth (~할 가치가 없어요)
1. It's not worth worrying about (그걸 걱정할 가치가 없어요)
2. It's not worth arguing over (그걸로 다툴 필요 없어요)
3. It's not worth getting upset about (그걸로 속상해할 필요 없어요)
4. It's not worth the time and effort (시간과 노력이 아까워요)
5. It's not worth reading that book (그 책을 읽을 가치가 없어요)
6. It's not worth fixing this old car (이 오래된 차를 고칠 필요 없어요)
7. It's not worth taking the risk (위험을 감수할 가치가 없어요)
8. It's not worth staying up all night (밤을 세울 필요 없어요)
9. It's not worth buying a new phone now (지금 새 휴대폰을 살 필요 없어요)
10. It's not worth fighting over something small (작은 일로 싸울 가치가 없어요)

Pattern 8: I'm sorry to hear that (~라니 안타깝네요)
1. I'm sorry to hear that you're sick (아프다니 안타깝네요)
2. I'm sorry to hear that you lost your job (직장을 잃었다니 안타깝네요)
3. I'm sorry to hear that you failed the test (시험에 실패했다니 안타깝네요)
4. I'm sorry to hear that you had a bad day (힘든 하루를 보냈다니 안타깝네요)
5. I'm sorry to hear that your pet passed away (반려동물이 세상을 떠났다니 안타깝네요)
6. I'm sorry to hear that you missed the opportunity (기회를 놓쳤다니 안타깝네요)
7. I'm sorry to hear that your plans changed (계획이 변경됐다니 안타깝네요)
8. I'm sorry to hear that you got into an accident (사고가 났다니 안타깝네요)
9. I'm sorry to hear that you're having a hard time (힘든 시간을 보내고 있다니 안타깝네요)
10. I'm sorry to hear that you didn't get the job (취업이 안 됐다니 안타깝네요)

Pattern 9: There's no (~가 없어요 / ~를 할 수 없어요)
1. There is no reason to be angry (화낼 이유가 없어요)
2. There is no need to rush (서두를 필요 없어요)
3. There is no turning back now (이제 돌아갈 길이 없어요)
4. There is no time to waste (시간을 낭비할 여유가 없어요)
5. There is no hope left (희망이 남아 있지 않아요)
6. There is no place like home (집만큼 좋은 곳은 없어요)
7. There is no point in arguing (논쟁해 봐야 소용없어요)
8. There is no one else to help (도와줄 사람이 없어요)
9. There is no food left in the fridge (냉장고에 음식이 하나도 없어요)
10. There is no doubt about it (의심할 여지가 없어요)

Pattern 10: It's not easy to (~하는 게 쉽지 않아요)
1. It's not easy to learn a new skill (새로운 기술을 배우는 건 쉽지 않아요)
2. It's not easy to wake up early (일찍 일어나는 건 쉽지 않아요)
3. It's not easy to find a good job (좋은 직장을 찾는 건 쉽지 않아요)
4. It's not easy to make friends (친구를 사귀는 건 쉽지 않아요)
5. It's not easy to start a business (사업을 시작하는 건 쉽지 않아요)
6. It's not easy to lose weight (살을 빼는 건 쉽지 않아요)
7. It's not easy to tell the truth (진실을 말하는 건 쉽지 않아요)
8. It's not easy to quit smoking (담배를 끊는 건 쉽지 않아요)
9. It's not easy to raise a child (아이를 키우는 건 쉽지 않아요)
10. It's not easy to admit mistakes (실수를 인정하는 건 쉽지 않아요)

Section 11: 복습 및 빈칸 확인 종합 훈련 (Review and Rapid Confirmation Drills)

Let's double-check all rules and requirements:
1. Target source title: `https://youtu.be/meJfHE7XOKA`
2. Title in template: `title: "https://youtu.be/meJfHE7XOKA"`
3. H1: `# 📄 https://youtu.be/meJfHE7XOKA`
4. Sections required:
   - ## 📌 요약 (Executive Summary)
   - ## 🗺️ 원문 구조 (Document Map)
   - ## 🧱 상세 분해 (Detailed Breakdown)
     - H3 1 to 11 (minimum 8 required, we will do 11)
   - ## 📊 사실 대장 (Fact Ledger)
   - ## 💡 주요 용어 (Key Terminology)
   - ## ⚠️ 미수록 구간 (Coverage Gap)
   - ## 🔗 연결 키워드 (Canonical Concepts)

5. Length requirement: MUST be over 6,000 Korean characters. Let's make sure each section is fully detailed with all 10 sentences per pattern, numbers, times, phrases, and Korean translations so that the character count comfortably exceeds 6,000 characters without any compression.
6. Absolutely NO preamble, NO markdown code block wrapper (no ``` markdown at start or end). Start immediately with `---`.

Let's carefully verify the character count and full content generation. Every pattern section will detail all 10 sentences with full Korean and English, exact quote, and detailed breakdown.

Let's structure the output cleanly.---
title: "https://youtu.be/meJfHE7XOKA"
aliases: []
tags: [source, mcp-extracted]
type: document
---
# 📄 https://youtu.be/meJfHE7XOKA

## 📌 요약 (Executive Summary)

- 본 소스는 유튜브 채널 "Jim's Language TV"의 기초영어 패턴 학습 영상 "[패턴영어#9] 기초영어패턴 100문장 | 원어민이 매일 밥 먹듯 쓰는 필수패턴 | 이것만 알아도~갑자기 영어 입이 트여요!"의 트랜스크립트 데이터이다.
- 원문은 원어민이 일상 회화에서 매일 사용하는 핵심 기초 패턴 10가지(I have to, I don't think, Would you mind, Can I get you, It takes, Do you know, It's not worth, I'm sorry to hear that, There's no, It's not easy to)와 각 패턴별 10문장씩 총 100개의 실전 대표 문장 및 복습 빈칸 훈련 체계로 구성되어 있다.
- 본 추출물은 원문에 등장하는 모든 패턴 공식, 한국어 해석, 영문 예문, 시각 수치(3 PM), 소요 시간(10 minutes, about an hour, years), 요일(Friday, Sundays), 기한 지표 및 상황별 표현(의무·과업 수행, 불확실성·반대 의견, 정중한 양해·허가 요청, 음식·서비스 제공, 필요·소요 조건, 정보·위치 문의, 가치 부정·안심, 안타까움·위로, 부재·불가능 상태, 난관 토로 등)을 단 한 건도 생략하지 않고 무손실로 구조화하여 재배열한 완성형 문서이다.

## 🗺️ 원문 구조 (Document Map)

1. 패턴 1: I have to (~해야 해요)
2. 패턴 2: I don't think (~라고 생각하지 않아요)
3. 패턴 3: Would you mind (~해도 괜찮을까요)
4. 패턴 4: Can I get you (~를 가져다 드릴까요)
5. 패턴 5: It takes (~만큼 걸려요 / ~가 필요해요)
6. 패턴 6: Do you know (~를 아세요)
7. 패턴 7: It's not worth (~할 가치가 없어요)
8. 패턴 8: I'm sorry to hear that (~라니 안타깝네요)
9. 패턴 9: There's no (~가 없어요 / ~를 할 수 없어요)
10. 패턴 10: It's not easy to (~하는 게 쉽지 않아요)
11. 복습 및 빈칸 채우기 종합 훈련 (Review and Rapid Fill-in-the-Blank Drills)

## 🧱 상세 분해 (Detailed Breakdown)

### 1. 패턴 1: I have to (~해야 해요)
- **핵심 논지**: 개인적 의무, 일상 과업, 일정 준수, 약속 및 직장 업무를 반드시 수행해야 함을 나타내는 구문 체계이다.
- **근거 및 데이터**:
  - 내일 조기 기상 의무: "I have to wake up early tomorrow." (내일 일찍 일어나야 해요.)
  - 은행 방문 과업: "I have to go to the bank today." (오늘 은행에 가야 해요.)
    - 장소/시스템: bank (은행)
  - 금요일 마감 보고서 완수 의무: "I have to finish this report by Friday." (금요일까지 이 보고서를 끝내야 해요.)
    - 요일/기한: by Friday (금요일까지)
    - 필드/어휘: finish this report by Friday (금요일까지 보고서 제출/완수)
  - 시험 공부 의무: "I have to study for my exam." (시험 공부를 해야 해요.)
  - 3 PM 회의 참석 시각 수치: "I have to attend a meeting at 3 PM." (오후 3시에 회의에 참석해야 해요.)
    - 시각 수치: 3 PM (오후 3시)
    - 필드/어휘: attend a meeting at 3 PM (오후 3시 회의 참석)
  - 공항 친구 마중/픽업 과업: "I have to pick up my friend from the airport." (공항에서 친구를 데리러 가야 해요.)
    - 장소: airport (공항)
  - 주말 방 청소 과업: "I have to clean my room this weekend." (이번 주말에 방을 청소해야 해요.)
  - 여권 갱신 수속: "I have to renew my passport soon." (곧 여권을 갱신해야 해요.)
    - 서류/필드: passport (여권)
  - 퇴근 후 식료품 구매: "I have to buy some groceries after work." (퇴근 후에 장을 봐야 해요.)
  - 상사 이메일 발송 과업: "I have to send an email to my boss." (상사에게 이메일을 보내야 해요.)
    - 수신 대상: my boss (상사)
- **주요 인용**: > "I have to wake up early tomorrow I have to go to the bank today I have to finish this report by Friday I have to study for my exam I have to attend a meeting at 3 PM I have to pick up my friend from the airport I have to clean my room this weekend I have to renew my passport soon I have to buy some groceries after work I have to send an email to my boss"

### 2. 패턴 2: I don't think (~라고 생각하지 않아요)
- **핵심 논지**: 자신의 추측, 반대 의견, 완곡한 거절, 불확실한 가능성에 대한 주관적 판단을 표현하는 구문 체계이다.
- **근거 및 데이터**:
  - 최선 선택 부정: "I don't think this is the best choice." (이게 최선의 선택이라고 생각하지 않아요.)
  - 파티 참석 회의적 전망: "I don't think she will come to the party." (그녀가 파티에 올 거라고 생각하지 않아요.)
  - 당일 마감 완수 불가능 판단: "I don't think I can finish this by today." (오늘 안에 이걸 끝낼 수 있을 것 같지 않아요.)
  - 타인의 인지 여부 회의: "I don't think he knows about it." (그가 이걸 알고 있다고 생각하지 않아요.)
  - 일기예보 우천 부정: "I don't think it's going to rain tomorrow." (내일 비가 올 것 같지 않아요.)
  - 의견 동의 불일치 예견: "I don't think they will agree with us." (그들이 우리와 동의할 거라고 생각하지 않아요.)
  - 식성 기호 추측: "I don't think she likes spicy food." (그녀가 매운 음식을 좋아한다고 생각하지 않아요.)
  - 일요일 매장 영업 부정: "I don't think this place is open on Sundays." (이곳이 일요일에 문을 연다고 생각하지 않아요.)
    - 요일 지표: on Sundays (일요일마다)
  - 현 시점 운전 부정적 평가: "I don't think it's a good idea to drive now." (지금 운전하는 게 좋은 생각이라고 생각하지 않아요.)
  - 진실성 의구심: "I don't think he is telling the truth." (그가 진실을 말하고 있다고 생각하지 않아요.)
- **주요 인용**: > "I don't think this is the best choice I don't think she will come to the party I don't think I can finish this by today I don't think he knows about it I don't think it's going to rain tomorrow I don't think they will agree with us I don't think she likes spicy food I don't think this place is open on Sundays I don't think it's a good idea to drive now I don't think he is telling the truth"

### 3. 패턴 3: Would you mind (~해도 괜찮을까요)
- **핵심 논지**: 타인의 공간, 소지품, 행위에 대해 정중하게 양해를 구하거나 허락을 요청하는 정중한 구문 체계이다.
- **근거 및 데이터**:
  - 착석 양해 요청: "Would you mind if I sit here?" (여기 앉아도 괜찮을까요?)
  - 창문 개방 양해 요청: "Would you mind if I open the window?" (창문을 열어도 괜찮을까요?)
  - 전화기 사용 양해 요청: "Would you mind if I use your phone?" (전화기를 사용해도 괜찮을까요?)
    - 기기: phone (전화기)
  - 필기구 대여 양해 요청: "Would you mind if I borrow your pen?" (펜을 빌려도 괜찮을까요?)
  - TV 전원 종료 양해 요청: "Would you mind if I turn off the TV?" (TV를 꺼도 괜찮을까요?)
    - 기기: TV (텔레비전)
  - 음악 변경 양해 요청: "Would you mind if I change the music?" (음악을 바꿔도 괜찮을까요?)
  - 질의 허락 요청: "Would you mind if I ask you a question?" (질문 하나 해도 괜찮을까요?)
  - 차량 주차 양해 요청: "Would you mind if I park my car here?" (여기에 주차해도 괜찮을까요?)
  - 조기 퇴장 양해 요청: "Would you mind if I leave a little early?" (조금 일찍 나가도 괜찮을까요?)
  - 동행인 동반 양해 요청: "Would you mind if I bring my friend?" (제 친구를 데려와도 괜찮을까요?)
- **주요 인용**: > "Would you mind if I sit here Would you mind if I open the window Would you mind if I use your phone Would you mind if I borrow your pen Would you mind if I turn off the TV Would you mind if I change the music Would you mind if I ask you a question Would you mind if I park my car here Would you mind if I leave a little early Would you mind if I bring my friend"

### 4. 패턴 4: Can I get you (~를 가져다 드릴까요)
- **핵심 논지**: 상대방에게 음식, 음료, 편의 물품, 이동 수단, 서비스를 적극적으로 제공하겠다고 제안하는 친절 구문 체계이다.
- **근거 및 데이터**:
  - 커피 제공 제안: "Can I get you a cup of coffee?" (커피 한 잔 가져다 드릴까요?)
    - 음료: coffee (커피)
  - 식수 제공 제안: "Can I get you some water?" (물 좀 가져다 드릴까요?)
  - 음식/간식 제공 제안: "Can I get you something to eat?" (드실 것 좀 가져다 드릴까요?)
  - 담요 제공 제안: "Can I get you a blanket?" (담요 가져다 드릴까요?)
  - 차림표 제공 제안: "Can I get you a menu?" (메뉴판 가져다 드릴까요?)
    - 문서: menu (메뉴판)
  - 택시 호출 서비스 제안: "Can I get you a taxi?" (택시 불러드릴까요?)
    - 교통 수단: taxi (택시)
  - 의구/의자 제공 제안: "Can I get you a chair?" (의자 하나 가져다 드릴까요?)
  - 귀가 승차 서비스 제안: "Can I get you a ride home?" (집까지 태워다 드릴까요?)
  - 추가 요구 사항 질의: "Can I get you anything else?" (다른 거 필요하세요?)
  - 좌석 교체 서비스 제안: "Can I get you a better seat?" (더 좋은 자리로 옮겨 드릴까요?)
- **주요 인용**: > "Can I get you a cup of coffee Can I get you some water Can I get you something to eat Can I get you a blanket Can I get you a menu Can I get you a taxi Can I get you a chair Can I get you a ride home Can I get you anything else Can I get you a better seat"

### 5. 패턴 5: It takes (~만큼 걸려요 / ~가 필요해요)
- **핵심 논지**: 특정 장소 이동 시 소요되는 시간, 소양 습득에 필요한 조건, 자원, 자금, 팀워크 등의 필수 요소를 나타내는 구문 체계이다.
- **근거 및 데이터**:
  - 10분 소요 시간 수치: "It takes 10 minutes to get there." (거기 가는데 10분 걸려요.)
    - 시간 수치: 10 minutes (10분)
    - 필드/어휘: 10 minutes to get there (이동 소요 시간 10분)
  - 언어 습득 소요 시간: "It takes time to learn a new language." (새로운 언어를 배우는데 시간이 걸려요.)
  - 양육 필요 조건(인내심): "It takes a lot of patience to raise a child." (아이를 키우는데 많은 인내심이 필요해요.)
  - 대중 연설 필요 조건(용기): "It takes courage to speak in public." (공개적으로 말하는 데는 용기가 필요해요.)
  - 건강 유지 필요 조건(노력): "It takes a lot of effort to stay healthy." (건강을 유지하려면 많은 노력이 필요해요.)
  - 조리 소요 시간 수치(약 1시간): "It takes about an hour to cook this dish." (이 요리를 만드는데 약 한 시간이 걸려요.)
    - 시간 수치: about an hour (약 1시간)
    - 필드/어휘: about an hour to cook (조리 소요 시간 약 1시간)
  - 프로젝트 완수 요건(팀워크): "It takes teamwork to complete this project." (이 프로젝트를 완수하려면 팀워크가 필요해요.)
    - 시스템/자원: teamwork (팀워크)
  - 창업 필요 자원(자금): "It takes a lot of money to start a business." (사업을 시작하는 데는 많은 돈이 필요해요.)
  - 숙련 소요 기간 수치(수년): "It takes years to master a skill." (기술을 완전히 익히는 데는 몇 년이 걸려요.)
    - 기간 수치: years (수년)
  - 연주 숙련 요건(연습): "It takes practice to play the piano well." (피아노를 잘 치려면 연습이 필요해요.)
- **주요 인용**: > "It takes 10 minutes to get there It takes time to learn a new language It takes a lot of patience to raise a child It takes courage to speak in public It takes a lot of effort to stay healthy It takes about an hour to cook this dish It takes teamwork to complete this project It takes a lot of money to start a business It takes years to master a skill It takes practice to play the piano well"

### 6. 패턴 6: Do you know (~를 아세요)
- **핵심 논지**: 상대방이 특정 정보, 장소, 조리법, 시각, 연락처, 구매처, 원인, 식당, 출발 시간, 사건 경위를 알고 있는지 질의하는 구문 체계이다.
- **근거 및 데이터**:
  - 편의시설/화장실 위치 문의: "Do you know where the restroom is?" (화장실이 어디 있는지 아세요?)
    - 장소: restroom (화장실)
  - 조리 방법/레시피 문의: "Do you know how to cook pasta?" (파스타 요리하는 방법을 아세요?)
  - 회의 시작 시각 문의: "Do you know what time the meeting starts?" (회의가 몇 시에 시작하는지 아세요?)
  - 개인 연락처/전화번호 문의: "Do you know his phone number?" (그의 전화번호를 아세요?)
    - 필드: phone number (전화번호)
  - 당일 방문 여부 문의: "Do you know if she is coming today?" (그녀가 오늘 오는지 아세요?)
  - 물품 구매처 문의: "Do you know where I can buy this?" (이걸 어디서 살 수 있는지 아세요?)
  - 감정 변화/분노 원인 문의: "Do you know why he is upset?" (그가 왜 화났는지 아세요?)
  - 인근 맛집/식당 정보 문의: "Do you know a good restaurant nearby?" (근처에 좋은 식당 아세요?)
  - 열차 출발 시각 문의: "Do you know when the train leaves?" (기차가 언제 출발하는지 아세요?)
    - 교통 수단: train (열차/기차)
  - 전일 사건/경위 문의: "Do you know what happened yesterday?" (어제 무슨 일이 있었는지 아세요?)
- **주요 인용**: > "Do you know where the restroom is Do you know how to cook pasta Do you know what time the meeting starts Do you know his phone number Do you know if she is coming today Do you know where I can buy this Do you know why he is upset Do you know a good restaurant nearby Do you know when the train leaves Do you know what happened yesterday"

### 7. 패턴 7: It's not worth (~할 가치가 없어요)
- **핵심 논지**: 걱정, 다툼, 감정 소비, 시간·노력 낭비, 구형 차량 수리, 위험 감수, 밤샘, 지출 등이 불필요하거나 가치가 없음을 전달하는 안심 및 단념 구문 체계이다.
- **근거 및 데이터**:
  - 걱정의 가무: "It's not worth worrying about." (그걸 걱정할 가치가 없어요.)
  - 논쟁/다툼의 가무: "It's not worth arguing over." (그걸로 다툴 필요 없어요.)
  - 감정 상함의 가무: "It's not worth getting upset about." (그걸로 속상해할 필요 없어요.)
  - 시간/노력 투여 가무: "It's not worth the time and effort." (시간과 노력이 아까워요.)
  - 도서 독서 가무: "It's not worth reading that book." (그 책을 읽을 가치가 없어요.)
  - 구형 차량 수리 가무: "It's not worth fixing this old car." (이 오래된 차를 고칠 필요 없어요.)
    - 대상: old car (오래된 차)
  - 위험 감수/리스크 가무: "It's not worth taking the risk." (위험을 감수할 가치가 없어요.)
  - 철야/밤샘 작업 가무: "It's not worth staying up all night." (밤을 세울 필요 없어요.)
  - 신규 휴대폰 구매 가무: "It's not worth buying a new phone now." (지금 새 휴대폰을 살 필요 없어요.)
    - 기기: phone (휴대폰)
  - 사소한 일로 다툼 가무: "It's not worth fighting over something small." (작은 일로 싸울 가치가 없어요.)
- **주요 인용**: > "It's not worth worrying about It's not worth arguing over It's not worth getting upset about It's not worth the time and effort It's not worth reading that book It's not worth fixing this old car It's not worth taking the risk It's not worth staying up all night It's not worth buying a new phone now It's not worth fighting over something small"

### 8. 패턴 8: I'm sorry to hear that (~라니 안타깝네요)
- **핵심 논지**: 상대방의 질병, 실직, 시험 낙방, 힘든 하루, 반려동물 상실, 기회 실기, 계획 변경, 사고 발생, 취업 실패 등 불행한 소식에 대해 공감과 위로를 전달하는 구문 체계이다.
- **근거 및 데이터**:
  - 질병 안타까움 위로: "I'm sorry to hear that you're sick." (아프다니 안타깝네요.)
  - 실직 안타까움 위로: "I'm sorry to hear that you lost your job." (직장을 잃었다니 안타깝네요.)
  - 시험 낙방 위로: "I'm sorry to hear that you failed the test." (시험에 실패했다니 안타깝네요.)
  - 악재 일상 위로: "I'm sorry to hear that you had a bad day." (힘든 하루를 보냈다니 안타깝네요.)
  - 반려동물 사망 위로: "I'm sorry to hear that your pet passed away." (반려동물이 세상을 떠났다니 안타깝네요.)
  - 기회 상실 위로: "I'm sorry to hear that you missed the opportunity." (기회를 놓쳤다니 안타깝네요.)
  - 일치 변경 위로: "I'm sorry to hear that your plans changed." (계획이 변경됐다니 안타깝네요.)
  - 사고 발생 위로: "I'm sorry to hear that you got into an accident." (사고가 났다니 안타깝네요.)
  - 난관 직면 위로: "I'm sorry to hear that you're having a hard time." (힘든 시간을 보내고 있다니 안타깝네요.)
  - 취업 실패 위로: "I'm sorry to hear that you didn't get the job." (취업이 안 됐다니 안타깝네요.)
- **주요 인용**: > "I'm sorry to hear that you're sick I'm sorry to hear that you lost your job I'm sorry to hear that you failed the test I'm sorry to hear that you had a bad day I'm sorry to hear that your pet passed away I'm sorry to hear that you missed the opportunity I'm sorry to hear that your plans changed I'm sorry to hear that you got into an accident I'm sorry to hear that you're having a hard time I'm sorry to hear that you didn't get the job"

### 9. 패턴 9: There's no (~가 없어요 / ~를 할 수 없어요)
- **핵심 논지**: 분노의 명분 부재, 서두름의 필요성 부재, 원상 복구 불가능, 시간적 여유 부재, 희망 부재, 대체 장소 부재, 논쟁 실익 부재, 조력자 부재, 음식 부재, 의심 부재를 선언하는 구문 체계이다.
- **근거 및 데이터**:
  - 분노 명분 부재: "There is no reason to be angry." (화낼 이유가 없어요.)
  - 서두름 필요성 부재: "There is no need to rush." (서두를 필요 없어요.)
  - 원상 회복 불가능 선언: "There is no turning back now." (이제 돌아갈 길이 없어요.)
  - 시간 허비 여유 부재: "There is no time to waste." (시간을 낭비할 여유가 없어요.)
  - 희망 잔여 부재: "There is no hope left." (희망이 남아 있지 않아요.)
  - 안식처 대체 부재: "There is no place like home." (집만큼 좋은 곳은 없어요.)
  - 논의 실익 부재: "There is no point in arguing." (논쟁해 봐야 소용없어요.)
  - 조력자 부재: "There is no one else to help." (도와줄 사람이 없어요.)
  - 냉장고 잔여 음식 부재: "There is no food left in the fridge." (냉장고에 음식이 하나도 없어요.)
    - 장소/기기: fridge (냉장고)
  - 확실성/의심 여지 부재 선언: "There is no doubt about it." (의심할 여지가 없어요.)
- **주요 인용**: > "There is no reason to be angry There is no need to rush There is no turning back now There is no time to waste There is no hope left There is no place like home There is no point in arguing There is no one else to help There is no food left in the fridge There is no doubt about it"

### 10. 패턴 10: It's not easy to (~하는 게 쉽지 않아요)
- **핵심 논지**: 신기술 습득, 조기 기상, 양질 직업 탐색, 대인관계 형성, 사업 개시, 체중 감량, 진실 고백, 금연, 양육, 실수 인정의 난이도와 난관을 표현하는 구문 체계이다.
- **근거 및 데이터**:
  - 신기술 습득 난관: "It's not easy to learn a new skill." (새로운 기술을 배우는 건 쉽지 않아요.)
  - 조기 기상 난관: "It's not easy to wake up early." (일찍 일어나는 건 쉽지 않아요.)
  - 양질 직업 구직 난관: "It's not easy to find a good job." (좋은 직장을 찾는 건 쉽지 않아요.)
  - 교우/대인관계 형성 난관: "It's not easy to make friends." (친구를 사귀는 건 쉽지 않아요.)
  - 사업 개시/창업 난관: "It's not easy to start a business." (사업을 시작하는 건 쉽지 않아요.)
  - 체중 감량/다이어트 난관: "It's not easy to lose weight." (살을 빼는 건 쉽지 않아요.)
  - 진실 고백/정직 난관: "It's not easy to tell the truth." (진실을 말하는 건 쉽지 않아요.)
  - 금연/담배 끊기 난관: "It's not easy to quit smoking." (담배를 끊는 건 쉽지 않아요.)
  - 자녀 양육 난관: "It's not easy to raise a child." (아이를 키우는 건 쉽지 않아요.)
  - 과오/실수 인정 난관: "It's not easy to admit mistakes." (실수를 인정하는 건 쉽지 않아요.)
- **주요 인용**: > "It's not easy to learn a new skill It's not easy to wake up early It's not easy to find a good job It's not easy to make friends It's not easy to start a business It's not easy to lose weight It's not easy to tell the truth It's not easy to quit smoking It's not easy to raise a child It's not easy to admit mistakes"

### 11. 복습 및 빈칸 채우기 종합 훈련 (Review and Rapid Fill-in-the-Blank Drills)
- **핵심 논지**: 패턴 1부터 10까지의 학습 내용을 한국어 문장 힌트와 영문 핵심 문형 빈칸 구조를 통하여 신속히 확인하고 완벽 각인시키는 평가 및 각인 훈련 체계이다.
- **근거 및 데이터**:
  - 주요 복습 확인 수록 항목:
    - 시험 공부를 해야 해요 -> "I have to study for my exam"
    - 곧 여권을 갱신해야 해요 -> "I have to renew my passport soon"
    - 그가 이걸 알고 있다고 생각하지 않아요 -> "I don't think he knows about it"
    - 그들이 우리와 동의할 거라고 생각하지 않아요 -> "I don't think they will agree with us"
    - 여기 앉아도 괜찮을까요 -> "Would you mind if I sit here"
    - 제 친구를 데려와도 괜찮을까요 -> "Would you mind if I bring my friend"
    - 메뉴판 가져다 드릴까요 -> "Can I get you a menu"
    - 집까지 태워다 드릴까요 -> "Can I get you a ride home"
    - 거기 가는데 10분 걸려요 -> "It takes 10 minutes to get there"
    - 공개적으로 말하는 데는 용기가 필요해요 -> "It takes courage to speak in public"
    - 그녀가 오늘 오는지 아세요 -> "Do you know if she is coming today"
    - 기차가 언제 출발하는지 아세요 -> "Do you know when the train leaves"
    - 밤을 세울 필요 없어요 -> "It's not worth staying up all night"
    - 다툴 필요 없어요 -> "It's not worth arguing over"
    - 직장을 잃었다니 안타깝네요 -> "I'm sorry to hear that you lost your job"
    - 사고가 났다니 안타깝네요 -> "I'm sorry to hear that you got into an accident"
    - 시간을 낭비할 여유가 없어요 -> "There is no time to waste"
    - 의심할 여지가 없어요 -> "There is no doubt about it"
    - 일찍 일어나는 건 쉽지 않아요 -> "It's not easy to wake up early"
    - 실수를 인정하는 건 쉽지 않아요 -> "It's not easy to admit mistakes"
- **주요 인용**: > "학습한 내용을 빈칸 채우기로 빠르게 확인해 보세요 시험 공부를 해야 해요 I have to study for my exam 곧 여권을 갱신해야 해요 I have to renew my passport soon"

## 📊 사실 대장 (Fact Ledger)

| 항목 | 값 | 원문 위치 |
|---|---|---|
| 보고서 제출 마감 지정 요일 | by Friday (금요일까지) | 상세 분해 1. 패턴 1 |
| 회의 참석 지정 시각 수치 | 3 PM (오후 3시) | 상세 분해 1. 패턴 1 |
| 휴무 매장 휴무 기준 요일 | on Sundays (일요일마다) | 상세 분해 2. 패턴 2 |
| 이동 소요 시간 측정 수치 | 10 minutes (10분) | 상세 분해 5. 패턴 5 |
| 요리 조리 소요 시간 수치 | about an hour (약 1시간) | 상세 분해 5. 패턴 5 |
| 숙련 소요 기간 측정 수치 | years (수년) | 상세 분해 5. 패턴 5 |
| 패턴 1 대표 구문 | I have to (~해야 해요) | 상세 분해 1. 패턴 1 |
| 패턴 2 대표 구문 | I don't think (~라고 생각하지 않아요) | 상세 분해 2. 패턴 2 |
| 패턴 3 대표 구문 | Would you mind (~해도 괜찮을까요) | 상세 분해 3. 패턴 3 |
| 패턴 4 대표 구문 | Can I get you (~를 가져다 드릴까요) | 상세 분해 4. 패턴 4 |
| 패턴 5 대표 구문 | It takes (~만큼 걸려요 / ~가 필요해요) | 상세 분해 5. 패턴 5 |
| 패턴 6 대표 구문 | Do you know (~를 아세요) | 상세 분해 6. 패턴 6 |
| 패턴 7 대표 구문 | It's not worth (~할 가치가 없어요) | 상세 분해 7. 패턴 7 |
| 패턴 8 대표 구문 | I'm sorry to hear that (~라니 안타깝네요) | 상세 분해 8. 패턴 8 |
| 패턴 9 대표 구문 | There's no (~가 없어요 / ~를 할 수 없어요) | 상세 분해 9. 패턴 9 |
| 패턴 10 대표 구문 | It's not easy to (~하는 게 쉽지 않아요) | 상세 분해 10. 패턴 10 |

## 💡 주요 용어 (Key Terminology)

- **I have to**: 직장 과업, 법적 의무, 일상 약속 등 피할 수 없이 반드시 수행해야 함을 전달하는 강한 의무 패턴.
- **I don't think**: 자신의 주관적 의견, 추측, 완곡한 거절 및 반대 입장을 상대방에게 정중하게 전달하는 패턴.
- **Would you mind**: 타인의 행동, 시청, 착석, 대여, 주차 등에 대해 사전 허락과 양해를 구하는 고급 정중 표현.
- **Can I get you**: 음료, 음식, 편의 도구, 이동 수단 등을 상대방에게 적극적·친절하게 봉사 및 제공하는 표현.
- **It takes**: 특정 장소에 다다르는 시간이나 특정 목적을 달성하는 데 필요한 자금, 용기, 팀워크 등의 필수 조건을 명시하는 패턴.
- **It's not worth**: 시간, 노력, 돈, 감정을 투여할 가치가 없거나 불필요하다고 판단할 때 안심과 단념을 유도하는 표현.
- **I'm sorry to hear that**: 타인의 실직, 질병, 사고, 시험 실패 등 나쁜 소식을 접했을 때 유감과 깊은 공감 위로를 나타내는 수사.

## ⚠️ 미수록 구간 (Coverage Gap)

없음

## 🔗 연결 키워드 (Canonical Concepts)

- **연결 키워드**: [기초영어, 필수패턴, 패턴영어, 100문장, 영어회화]

---

*source: NotebookLM / Jim's Language TV*