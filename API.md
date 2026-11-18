# SimuCore 3D — สัญญา REST API สำหรับหลังบ้าน

เอกสารนี้บอกว่าเซิร์ฟเวอร์ต้องตอบอะไร เพื่อให้หน้าเว็บที่มีอยู่ทำงานกับฐานข้อมูลจริงได้ทันที
หน้าเว็บเรียกผ่าน `ApiAdapter` ใน `store.js` เท่านั้น ทำหลังบ้านด้วย PHP (XAMPP), Node.js หรือภาษาใดก็ได้

## เปิดใช้งาน

แก้ `config.js`:

```js
window.SIMUCORE_CONFIG = { mode: 'api', apiBase: 'https://lab.school.ac.th/api', allowGuest: true };
```

ผู้เยี่ยมชม (Guest) ยังเก็บงานในเบราว์เซอร์เสมอ ไม่ส่งขึ้นเซิร์ฟเวอร์

## กติกาทั่วไป

- รับ-ส่ง JSON (`Content-Type: application/json`, UTF-8)
- ทุก endpoint ยกเว้น `/auth/register` และ `/auth/login` ต้องมี `Authorization: Bearer <token>`
- token หมดอายุหรือไม่ถูกต้อง → ตอบ `401` หน้าเว็บจะพากลับไปหน้าเข้าสู่ระบบ
- ข้อผิดพลาดตอบรูปแบบเดียวกันเสมอ (หน้าเว็บแสดง `message` ให้ผู้ใช้เห็นตรง ๆ จึงควรเป็นภาษาไทยที่อ่านเข้าใจ):

```json
{ "code": "taken", "message": "ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองชื่ออื่น", "field": "username" }
```

| code | ใช้เมื่อ | HTTP |
|---|---|---|
| `invalid` | ข้อมูลไม่ผ่านการตรวจ (ระบุ `field`) | 422 |
| `taken` | ชื่อผู้ใช้ซ้ำ | 409 |
| `credentials` | ชื่อผู้ใช้/รหัสผ่านผิด | 401 (login) / 422 |
| `auth` | ยังไม่เข้าสู่ระบบ / token หมดอายุ | 401 |
| `not_found` | ไม่พบข้อมูล | 404 |
| `forbidden` | ไม่มีสิทธิ์ (เช่น นักเรียนดูข้อมูลคนอื่น) | 403 |

## วัตถุ User

```json
{ "id": 12, "username": "somchai.k", "fullName": "สมชาย ใจดี", "role": "student",
  "classroom": "ปวช.3/1", "studentId": "65001", "createdAt": "2026-11-17T13:00:00Z" }
```

`role` เป็น `student`, `teacher` หรือ `admin`

## บัญชีผู้ใช้

| Method | Path | Body | ตอบกลับ |
|---|---|---|---|
| POST | `/auth/register` | `{ fullName, username, password, role, classroom, studentId }` | `201 { token, user }` |
| POST | `/auth/login` | `{ username, password, remember }` | `200 { token, user }` |
| POST | `/auth/logout` | – | `204` (ลบ session ของ token นี้) |
| PATCH | `/me` | `{ fullName, classroom, studentId }` | `200 { user }` |
| POST | `/me/password` | `{ oldPassword, newPassword }` | `204` |

ข้อกำหนดการตรวจ (ต้องตรงกับหน้าเว็บ):

- `username`: `^[a-z0-9._-]{4,30}$` (แปลงเป็นตัวพิมพ์เล็กก่อนบันทึก)
- `password`: อย่างน้อย 8 ตัว เก็บด้วย `password_hash()` / bcrypt เท่านั้น
- `role` ตอนสมัคร: `student` หรือ `teacher` (ครูควรให้ admin อนุมัติก่อนใช้งานจริง)
- `remember: true` → token อายุ 30 วัน, ไม่ติ๊ก → 1 วัน
- จำกัดการลองรหัสผ่านผิด เช่น 5 ครั้งใน 15 นาทีต่อชื่อผู้ใช้

## โครงการ

| Method | Path | Body | ตอบกลับ |
|---|---|---|---|
| GET | `/projects` | – | `{ projects: Project[] }` (ใหม่สุดก่อน) |
| POST | `/projects` | `{ name, model }` | `201 { project }` |
| DELETE | `/projects/:id` | – | `204` (ลบ workspace ของโครงการด้วย) |

```json
{ "id": 1731850000000, "name": "ห้องคอม อาคาร 3", "model": "network", "createdAt": "17/11/2569" }
```

`model` คือรหัสแล็บ: `network`, `datacenter`, `portal`, `panorama`, `wireless`, `wan`

## ห้อง 3D (Workspace)

| Method | Path | Body | ตอบกลับ |
|---|---|---|---|
| GET | `/workspaces/:key` | – | `{ data }` หรือ `404 { code: "not_found" }` |
| PUT | `/workspaces/:key` | `{ data }` | `204` |

`:key` คือ id ของโครงการ หรือ `demo-<lab>` สำหรับห้องทดลอง
`data` เป็น JSON ก้อนเดียว (ไม่ต้องแยกตาราง) มีขนาดประมาณ 5–60 KB:

```json
{ "version": 5, "room": { "size": "medium", "floor": "raised" },
  "net": { "version": 4, "stp": true, "scale": 1, "walls": [[-7, -5, 7, -5, 10]], "devices": [ { ..., "acl": [{ "ip": "192.168.1.11", "mask": "255.255.255.255" }] } ], "links": [ ... ] },
  "activity": { "lab": "network", "startedAt": 1731850000000, "flags": [], "completedAt": null },
  "updatedAt": "17/11/2569 20:30:00" }
```

## รายงานและคะแนน

| Method | Path | Body | ตอบกลับ |
|---|---|---|---|
| GET | `/reports` | – | `{ reports: Report[] }` (ใหม่สุดก่อน ไม่เกิน 50) |
| POST | `/reports` | Report | `201 { report }` |
| DELETE | `/reports` | – | `204` |

```json
{ "projectName": "ห้องคอม อาคาร 3", "model": "network", "devices": 6, "status": "ผ่าน",
  "date": "17/11/2569 20:31:02", "score": "100%", "time": "3 นาที 12 วินาที",
  "activity": "ภารกิจ LAB 01 — ติดตั้งห้องคอมพิวเตอร์" }
```

`score`, `time`, `activity` มีเฉพาะรายงานจากการทำภารกิจ (เก็บ `score` เป็นตัวเลขในคอลัมน์ `score_percent`)

## XP เลเวล และเหรียญรางวัล

| Method | Path | Body | ตอบกลับ |
|---|---|---|---|
| GET | `/me/progress` | – | `{ progress }` |
| POST | `/me/progress/award` | `{ xp, reason, once?, badges? }` | `{ progress, gained, newBadges, levelUp }` |
| GET | `/leaderboard?classroom=ปวช.3/1` | – | `{ leaderboard: [{ user, xp, badges }] }` (มากสุดก่อน 20 คน) |

```json
{ "xp": 560, "badges": { "detective": "2026-11-17T14:20:00Z" }, "once": ["lab-done-network", "first-link"],
  "log": [{ "xp": 150, "reason": "ภารกิจสำเร็จ: ...", "badges": ["lab_clear"], "at": "..." }], "updatedAt": "..." }
```

- `once` = รหัสรางวัลที่ให้ได้ครั้งเดียว ถ้าซ้ำ ให้ `gained: 0` (กันกดเก็บแต้มซ้ำ)
- รายชื่อเหรียญและเกณฑ์เลเวลอยู่ใน `Store.GAME` (store.js) ให้เซิร์ฟเวอร์ใช้ชุดเดียวกัน
- ตรรกะคำนวณเหมือน `applyAward()` ใน store.js ย้ายไปเขียนฝั่งเซิร์ฟเวอร์ได้ตรงๆ
- ⚠ โหมดนี้เชื่อค่า XP ที่หน้าเว็บส่งมา ถ้าต้องการกันโกงจริง ให้เซิร์ฟเวอร์จำกัด XP ต่อครั้ง (เช่น ≤ 300) และจำกัดจำนวนครั้งต่อนาที

## แดชบอร์ดครู (teacher.html)

| Method | Path | ตอบกลับ |
|---|---|---|
| GET | `/teacher/overview?classroom=ปวช.3/1` | `{ classrooms: ["ปวช.3/1", ...], students: [{ user, progress, reports }] }` |

- ต้องตรวจว่าผู้เรียกมี `role = 'teacher'` (ไม่งั้นตอบ `403 { code: "forbidden" }`)
- หน้าเว็บดึงข้อมูลใหม่ทุก 5 วินาที (แบบสด) และส่งออก CSV เองในเบราว์เซอร์
- `reports` ของแต่ละคนส่งล่าสุดไม่เกิน 50 รายการก็พอ หน้าเว็บหาคะแนนสูงสุดรายบทเอง (หรือใช้ view `v_best_scores`)

แนะนำให้ทำเพิ่มภายหลัง: `POST /classrooms` (ครูสร้างห้อง ได้รหัสเข้าห้อง), `POST /classrooms/join` (นักเรียนเข้าห้องด้วยรหัส)

## ความปลอดภัยขั้นต่ำ

- ใช้ HTTPS เสมอ
- เก็บรหัสผ่านด้วย `password_hash()` และตรวจด้วย `password_verify()`
- เก็บ token เป็นค่าแฮช SHA-256 ในตาราง `sessions`
- ใช้ Prepared Statement ทุกคำสั่ง SQL
- ตรวจว่า `user_id` ของข้อมูลตรงกับผู้ที่ล็อกอินทุกครั้ง (กันนักเรียนแก้งานของคนอื่น)
- `/teacher/*` ให้เฉพาะ role ครู และเห็นเฉพาะนักเรียนในห้องที่ตัวเองดูแล

## หมายเหตุรูปแบบข้อมูลห้อง 3D (`net` ใน workspace)

เก็บเป็น JSON ก้อนเดียว หลังบ้านไม่ต้องแยกตาราง:
- `scale` (ม./หน่วย), `walls` ([x1,z1,x2,z2,ลดสัญญาณ dB]) — พื้นที่หลายห้อง/อาคาร
- `links[].route` — จุดหักของสายที่จัดเส้นทางเอง (`{at, x, y, z}` หรือยึดกับอุปกรณ์ `{at, dev, dx, dy, dz}`)
- `devices[].nat.forwards` — Port Forwarding (`{proto, port, ip, toPort}`), `devices[].wifi.guest` — Wi-Fi แขก (`{ssid, key}`), `devices[].acl`


## ห้องเรียน IoT (`iot.html`, `iot-lab.html`)

ไม่มี endpoint ใหม่ ใช้ `/workspaces/:key` และ `/me/progress/award` เดิม

- **workspace key:** `iot-<บทเรียน>` เช่น `iot-motion-light`, `iot-fire-alarm`, `iot-smart-farm`, `iot-smart-door`, `iot-smart-class`, `iot-smart-home`, `iot-free`
- **data:**
  ```json
  {
    "kind": "iot", "lesson": "fire-alarm", "savedAt": "2026-11-18T08:00:00Z",
    "passed": [true, true, false, false, false],
    "project": {
      "version": 1,
      "env": { "temp": 28, "light": 70, "soil": 60, "smoke": 0, "motion": 0, "door": 0 },
      "parts": [
        { "id": 1, "type": "esp32", "name": "ESP32-1", "x": 0, "z": 0.4, "cloud": true },
        { "id": 2, "type": "smoke", "name": "Smoke-1", "x": -2.6, "z": 0.2, "link": { "board": 1, "pin": "D2" } }
      ],
      "rules": [
        { "id": 1, "board": 1, "join": "and", "conds": [{ "part": 2, "op": "==", "value": 1 }],
          "then": { "action": "on", "part": 3 }, "else": { "action": "off", "part": 3 } }
      ]
    }
  }
  ```
- **XP (`once`):** `iot-task-<บทเรียน>-<ข้อ>` (+10), `iot-done-<บทเรียน>` (+60, เหรียญ `iot_first`), `iot-notify` (+30, เหรียญ `iot_cloud`), `iot-all` (+200, เหรียญ `iot_master`)
- แดชบอร์ดครูคำนวณคอลัมน์ IoT จาก `once` ที่ขึ้นต้นด้วย `iot-done-` (ไม่ต้องเก็บตารางเพิ่ม)
- รุ่นอุปกรณ์ IoT เดิมในแค็ตตาล็อกเครือข่าย (`MCU-PT`, `SBC-PT`, `IoT-*`) ยังอยู่เพื่อให้งานเก่าเปิดได้ แต่ซ่อนจากแถบเลือกอุปกรณ์ของแล็บเครือข่ายแล้ว
