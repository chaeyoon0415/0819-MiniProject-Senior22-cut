# 접수 시스템 Form 정책

> 세 DB의 select/드롭다운 필드별 허용 값, 자격종목별 수수료, 시험지역/센터 목록, 시험과목.
> form 구현 시 이 문서의 값만 사용한다.

---

## 1. 두두넷 국가기술자격 (national_applications)

### 자격종목 (qualification_code)

| 코드 | 종목명 | 접수방식 | 필기 수수료 |
|------|--------|----------|------------|
| 7910 | 한식조리기능사 | 상시CBT | 14,500원 |
| 7520 | 지게차운전기능사 | 상시CBT | 14,500원 |
| 7530 | 굴착기운전기능사 | 상시CBT | 14,500원 |
| 2300 | 전기기능사 | 정기(연4회) | 14,500원 |

### 등급 (grade)

| 값 | 비고 |
|----|------|
| 기능사 | 위 4종 전부 기능사 등급 |

> 산업기사/기사/기능장/기술사는 이 서비스에서 취급하지 않음.

### 시험유형 (exam_type)

| 값 | 대상 종목 |
|----|----------|
| 정기 | 전기기능사 |
| 상시CBT | 한식조리기능사, 지게차운전기능사, 굴착기운전기능사 |

### 시험구분 (exam_category)

| 값 | 비고 |
|----|------|
| 필기 | 이 서비스 범위. 실기는 취급하지 않음 |

### 회차 (exam_round)

| 접수방식 | 허용 값 |
|----------|---------|
| 정기 | 1, 2, 3, 4 |
| 상시CBT | null (해당없음) |

### 응시자격유형 (eligibility_type)

| 값 | 설명 |
|----|------|
| 제한없음 | 기능사는 응시자격 제한 없음 |
| 관련학과졸업 | 관련학과 졸업(예정)자 |
| 경력 | 실무경력 보유자 |
| 기타 | 기타 자격 보유 등 |

> 기능사 필기는 누구나 응시 가능. "제한없음" 선택 시 학력/경력 입력 불필요.

### 시험지역 (exam_region) - 17개 광역

| 값 |
|----|
| 서울 |
| 부산 |
| 대구 |
| 인천 |
| 광주 |
| 대전 |
| 울산 |
| 세종 |
| 경기 |
| 강원 |
| 충북 |
| 충남 |
| 전북 |
| 전남 |
| 경북 |
| 경남 |
| 제주 |

### 교시 (exam_session)

| 접수방식 | 허용 값 | 시험시간 |
|----------|---------|----------|
| 정기 | 1교시 | 09:30 |
| 정기 | 2교시 | 11:00 |
| 정기 | 3교시 | 13:30 |
| 정기 | 4교시 | 15:00 |
| 정기 | 5교시 | 16:30 |
| 상시CBT | 09:00 | 오전1 |
| 상시CBT | 10:30 | 오전2 |
| 상시CBT | 13:00 | 오후1 |
| 상시CBT | 14:30 | 오후2 |
| 상시CBT | 16:00 | 오후3 |

### 감면유형 (fee_discount_type)

| 값 | 감면율 |
|----|--------|
| 없음 | 0% |
| 장애인 | 50% |
| 기초생활수급자 | 50% |
| 국가유공자 | 50% |
| 차상위계층 | 50% |

### 결제수단 (payment_method)

| 값 |
|----|
| 신용카드 |
| 계좌이체 |
| 가상계좌 |

---

## 2. 두두넷 전문자격 (professional_applications)

### 자격종목 (qualification_code)

| 코드 | 종목명 | 1차 수수료 | 2차 수수료 |
|------|--------|-----------|-----------|
| P001 | 손해평가사 | 30,000원 | 30,000원 |
| P002 | 공인중개사 | 13,400원 | 15,200원 |

### 차수 (exam_stage)

| 값 | 비고 |
|----|------|
| 1차 | 전문자격 1차 시험 |
| 2차 | 1차 합격자만 응시 가능 |

### 시험과목 (subject_1 ~ subject_5)

**손해평가사 1차** (2과목 필수)

| 필드 | 과목명 |
|------|--------|
| subject_1 | 상법 보험편 |
| subject_2 | 농어업재해보험법령 |

**손해평가사 2차** (2과목 필수)

| 필드 | 과목명 |
|------|--------|
| subject_1 | 농작물재해보험 및 가축재해보험의 이론과 실무 |
| subject_2 | 농작물재해보험 및 가축재해보험 손해평가의 이론과 실무 |

**공인중개사 1차** (2과목 필수)

| 필드 | 과목명 |
|------|--------|
| subject_1 | 부동산학개론 |
| subject_2 | 민법 및 민사특별법 |

**공인중개사 2차** (3과목)

| 필드 | 과목명 | 필수/선택 |
|------|--------|----------|
| subject_1 | 공인중개사법령 및 중개실무 | 필수 |
| subject_2 | 부동산공법 | 필수 |
| subject_3 | 부동산공시법 및 부동산세법 | 선택 |

### 시험지역 (exam_region) - 국가기술자격과 동일 17개

### 교시 (exam_session)

| 차수 | 교시 | 시간 |
|------|------|------|
| 1차 | 1교시 | 09:30 |
| 1차 | 2교시 | 11:00 |
| 2차 | 1교시 | 13:30 |
| 2차 | 2교시 | 15:00 |

### 감면유형 - 국가기술자격과 동일

### 결제수단 - 국가기술자격과 동일

---

## 3. 두두보건 (duhealth_applications)

### 자격종류 (qualification_type)

| 값 | 수수료 | 교육이수시간 |
|----|--------|-------------|
| 요양보호사 | 32,000원 | 240시간 |
| 위생사 | 30,000원 | - (학과 이수) |

### 실명인증방식 (real_name_method)

| 값 |
|----|
| 휴대폰 |
| 아이핀 |
| 공동인증서 |

### 시험센터 (test_center_code) - 전국 9개

| 코드 | 센터명 |
|------|--------|
| C01 | 서울 |
| C02 | 부산 |
| C03 | 대구 |
| C04 | 광주 |
| C05 | 대전 |
| C06 | 수원 |
| C07 | 청주 |
| C08 | 전주 |
| C09 | 제주 |

### 시간대 (test_time_slot)

| 값 | 시험시작 |
|----|----------|
| AM | 09:00 |
| PM | 14:00 |

### 장애유형 (disability_type) - 편의제공 신청용

| 값 |
|----|
| 없음 |
| 지체장애 |
| 시각장애 |
| 청각장애 |
| 뇌병변장애 |
| 기타 |

### 감면유형 (fee_discount_type)

| 값 | 감면율 |
|----|--------|
| 없음 | 0% |
| 장애인 | 50% |
| 기초수급 | 면제 |
| 국가유공자 | 50% |
| 차상위계층 | 50% |

> 두두보건은 '기초생활수급자'가 아닌 '기초수급'으로 표기 (의도적 불일치).

### 결제수단 (payment_method)

| 값 |
|----|
| 신용카드 |
| 계좌이체 |
| 가상계좌 |

> DB 저장 시 소문자 영문: card / transfer / virtual (의도적 불일치).

### 교육기관 (training_institution) - 요양보호사 예시

| 기관명 |
|--------|
| 서울시립요양보호사교육원 |
| 부산광역시요양보호사교육원 |
| 대한적십자사 서울지사 |
| 한국요양보호협회 교육센터 |
| 사회복지법인 위드 교육원 |

> 교육기관은 고정 목록이 아님. 수료증에 기재된 기관명을 직접 입력.

### 교육기관 (training_institution) - 위생사 예시

| 기관명 |
|--------|
| 보건환경연구원 |
| 한국보건복지인력개발원 |
| 대학교 보건학과 |

> 위생사는 보건관련학과 졸업이 응시자격. 교육기관 = 졸업 대학/학과명 기입.

---

## form 단계별 필드 배치

### 국가기술자격 - 접수 form 순서

| 단계 | 필드 | 입력방식 |
|------|------|----------|
| 1. 종목 선택 | qualification_code | select (4종) |
| | grade | 자동 (기능사 고정) |
| | exam_type | 자동 (종목에 따라 정기/상시CBT) |
| | exam_category | 자동 (필기 고정) |
| 2. 회차/일정 | exam_round | select (정기만, 1~4) |
| | exam_region | select (17개) |
| | exam_district | select (지역에 따라 동적) |
| | exam_center_code | select (시군구에 따라 동적) |
| | exam_date | select (센터별 가용일) |
| | exam_session | select (교시/시간대) |
| 3. 응시자격 | eligibility_type | select |
| | education_* | text (자격유형이 학력인 경우) |
| | career_* | text (자격유형이 경력인 경우) |
| 4. 사진 | photo_url | file upload |
| 5. 결제 | fee_amount | 자동 (14,500원) |
| | fee_discount_type | select |
| | fee_final | 자동 계산 |
| | payment_method | select (3종) |

### 전문자격 - 접수 form 순서

| 단계 | 필드 | 입력방식 |
|------|------|----------|
| 1. 종목 선택 | qualification_code | select (2종) |
| | exam_stage | select (1차/2차) |
| | exam_year | 자동 (당해연도) |
| 2. 1차 합격 | is_first_pass_holder | checkbox (2차만) |
| | first_pass_year | select (2차만) |
| | first_pass_number | text (2차만) |
| 3. 과목 확인 | subject_1~5 | 자동 표시 (종목+차수 조합) |
| 4. 응시자격 | eligibility_type | select |
| | education_* / career_* | text |
| 5. 시험장 | exam_region | select (17개) |
| | exam_center_code | select |
| | exam_date | 자동 (연 1회 고정일) |
| | exam_session | select (교시) |
| 6. 사진 | photo_url | file upload |
| 7. 결제 | fee_amount | 자동 (종목별) |
| | fee_discount_type | select |
| | payment_method | select (3종) |

### 두두보건 - 접수 form 순서

| 단계 | 필드 | 입력방식 |
|------|------|----------|
| 1. 자격종류 | qualification_type | select (요양보호사/위생사) |
| 2. 실명인증 | name | text |
| | resident_number_enc | text (주민번호) |
| | real_name_method | select (3종) |
| | real_name_verified | 자동 (인증 결과) |
| 3. 연락처 | phone | text |
| | email | text |
| | zip_code + address | 주소검색 |
| 4. 교육수료 | training_institution | text |
| | training_cert_number | text |
| | training_completion_date | date picker |
| | training_hours | number (요양보호사 240, 위생사 학과이수) |
| 5. 사진 | photo_file_url | file upload |
| | photo_resolution_dpi | 자동 검증 (200dpi 이상) |
| | photo_width_px / photo_height_px | 자동 검증 (276x354px 이상) |
| 6. 편의제공 | disability_type | select (선택) |
| | accommodation_request | textarea (선택) |
| 7. 시험센터 | test_center_code | select (9개) |
| | test_date | select (센터별 가용일) |
| | test_time_slot | select (AM/PM) |
| 8. 결제 | fee_amount | 자동 (종류별) |
| | fee_discount_type | select |
| | payment_method | select (3종) |

---

## 세 DB 불일치 요약 (통합 시 유의사항)

 세 DB의 CSV를 통합할 때 부딪히는 차이.

| 항목 | 국가기술 | 전문 | 두두보건 |
|------|---------|------|---------|
| 필드명 언어 | 한글 | 영문 snake_case | camelCase |
| 날짜 형식 | YYYY-MM-DD | YYYY/MM/DD | DD-MM-YYYY |
| 성별 표기 | 남/여 | M/F | 1/2 |
| 결제수단 표기 | 신용카드/계좌이체/가상계좌 | CARD/BANK/VIRTUAL | card/bank/virtual |
| 접수상태 표기 | 접수완료/결제대기/취소 | CONFIRMED/PENDING/CANCELLED | active/pending/cancelled |
| 연락처 형식 | 010-xxxx-xxxx | 010-xxxx-xxxx | 01xxxxxxxxx |
