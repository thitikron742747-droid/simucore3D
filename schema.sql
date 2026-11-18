-- ===========================================================================
-- SimuCore 3D — โครงสร้างฐานข้อมูล (MySQL 8 / MariaDB 10.5+)
-- ใช้คู่กับ docs/API.md และ store.js (ApiAdapter)
-- นำเข้าใน phpMyAdmin หรือคำสั่ง:  mysql -u root -p < database/schema.sql
-- ===========================================================================
CREATE DATABASE IF NOT EXISTS simucore
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE simucore;

-- ---------------------------------------------------------------------------
-- ห้องเรียน (ครูสร้าง นักเรียนเข้าร่วมด้วยรหัสห้อง)
-- ---------------------------------------------------------------------------
CREATE TABLE classrooms (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(60)  NOT NULL,                 -- เช่น ปวช.3/1
  join_code    CHAR(6)      NOT NULL UNIQUE,          -- รหัสเข้าห้อง เช่น NET3A1
  teacher_id   INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- ผู้ใช้ — password_hash เก็บค่าจาก password_hash() ของ PHP หรือ bcrypt (ห้ามเก็บรหัสผ่านจริง)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(30)  NOT NULL UNIQUE,         -- a-z 0-9 . _ - 4–30 ตัว
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(80)  NOT NULL,
  role           ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
  classroom      VARCHAR(40)  NULL,                    -- ข้อความที่ผู้ใช้กรอก
  classroom_id   INT UNSIGNED NULL,                    -- ห้องที่เข้าร่วมจริง
  student_id     VARCHAR(20)  NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_class FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE classrooms
  ADD CONSTRAINT fk_class_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- เซสชัน / Token ที่ใช้ใน Header  Authorization: Bearer <token>
-- เก็บเฉพาะค่าแฮช SHA-256 ของ token เผื่อฐานข้อมูลรั่ว
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  token_hash   CHAR(64)     NOT NULL UNIQUE,
  user_agent   VARCHAR(255) NULL,
  ip_address   VARCHAR(45)  NULL,
  expires_at   DATETIME     NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- โครงการ (ห้องที่ผู้ใช้สร้าง)
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  name         VARCHAR(60)  NOT NULL,
  lab          ENUM('network','datacenter','portal','panorama','wireless','wan') NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_projects_user (user_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- สถานะห้อง 3D (อุปกรณ์ สาย ค่าคอนฟิก สถานะภารกิจ) เก็บเป็น JSON ทั้งก้อน
-- workspace_key = id ของโครงการ หรือ 'demo-<lab>' สำหรับห้องทดลอง
--                 หรือ 'iot-<บทเรียน>' สำหรับห้องเรียน IoT เช่น 'iot-fire-alarm', 'iot-free'
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
  user_id        INT UNSIGNED NOT NULL,
  workspace_key  VARCHAR(40)  NOT NULL,
  data           JSON         NOT NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, workspace_key),
  CONSTRAINT fk_ws_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- รายงาน: ผลการกด "รันระบบ" และคะแนนภารกิจ
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  project_name   VARCHAR(80)  NOT NULL,
  lab            VARCHAR(20)  NOT NULL,
  devices        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status         ENUM('ผ่าน','มีคำเตือน','ไม่ผ่าน') NOT NULL,
  activity       VARCHAR(120) NULL,                  -- ชื่อภารกิจ (ถ้าเป็นการส่งงานภารกิจ)
  score_percent  TINYINT UNSIGNED NULL,              -- 0–100
  time_text      VARCHAR(40)  NULL,                  -- เวลาที่ใช้ เช่น "3 นาที 12 วินาที"
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reports_user (user_id, created_at),
  INDEX idx_reports_activity (lab, score_percent)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- XP / เลเวล / เหรียญรางวัล (1 แถวต่อผู้ใช้) + ประวัติการได้ XP
-- ---------------------------------------------------------------------------
CREATE TABLE progress (
  user_id     INT UNSIGNED PRIMARY KEY,
  xp          INT UNSIGNED NOT NULL DEFAULT 0,
  once_keys   JSON NOT NULL,                       -- รหัสรางวัลที่ได้ไปแล้ว (ให้ครั้งเดียว)
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_progress_xp (xp)
) ENGINE=InnoDB;

CREATE TABLE user_badges (
  user_id     INT UNSIGNED NOT NULL,
  badge       VARCHAR(30)  NOT NULL,               -- เช่น detective, defender, stp (ดู Store.GAME.BADGES)
  earned_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, badge),
  CONSTRAINT fk_badges_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE xp_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  xp          SMALLINT UNSIGNED NOT NULL,
  reason      VARCHAR(80) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_xplog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_xplog_user (user_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- มุมมองสำหรับครู: คะแนนภารกิจสูงสุดของนักเรียนแต่ละคนในแต่ละแล็บ
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_best_scores AS
SELECT u.id AS user_id, u.full_name, u.student_id, u.classroom_id, r.lab,
       MAX(r.score_percent) AS best_score, COUNT(*) AS attempts, MAX(r.created_at) AS last_submit
FROM reports r
JOIN users u ON u.id = r.user_id
WHERE r.score_percent IS NOT NULL
GROUP BY u.id, u.full_name, u.student_id, u.classroom_id, r.lab;

-- ---------------------------------------------------------------------------
-- สร้างบัญชีผู้ดูแลระบบคนแรก (ทำหลังนำเข้าไฟล์นี้)
--   1) สร้างค่าแฮชรหัสผ่าน:  php -r "echo password_hash('รหัสผ่านของคุณ', PASSWORD_DEFAULT);"
--   2) แทนค่า <HASH> ด้านล่างแล้วรันคำสั่ง
-- INSERT INTO users (username, password_hash, full_name, role)
-- VALUES ('admin', '<HASH>', 'ผู้ดูแลระบบ', 'admin');
-- ---------------------------------------------------------------------------

-- ตารางอันดับในห้องเรียน (GET /leaderboard)
CREATE OR REPLACE VIEW v_leaderboard AS
SELECT u.id AS user_id, u.full_name, u.classroom_id, COALESCE(p.xp, 0) AS xp,
       (SELECT COUNT(*) FROM user_badges b WHERE b.user_id = u.id) AS badges
FROM users u
LEFT JOIN progress p ON p.user_id = u.id
WHERE u.role = 'student';
