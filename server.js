
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const { computeSystemExecutablePath } = require('@puppeteer/browsers');
const puppeteer = require('puppeteer-core');

const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const PORT = process.env.PORT || 3001;
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const db = new sqlite3.Database('./sample_game_db.sqlite');
const FormData1 = require('form-data');
const { log } = require('console');
const cheerio = require('cheerio');
const { title } = require('process');
const { type } = require('os');
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzIlzn5gfKE38-mAGx1W7VCPfCu78nYDEnPmb6aUPVRl_dWALFthGYHFYbCSqyB0WLYw/exec";


app.use(express.json());
app.use(cors());

// Route đăng nhập
app.get('/login', async (req, res) => {
  try {
    const { csrfToken, cookies } = await login();
    // Lưu cookies và csrfToken vào file
    fs.writeFileSync('cookies.json', JSON.stringify(cookies));
    fs.writeFileSync('csrfToken.txt', csrfToken);
    res.json({ success: true, csrfToken });
  } catch (error) {
    console.error('Login failed:', error);
    res.json({ success: false, message: error });
  }
});

// API: /games?date=YYYY-MM-DD
app.get('/games', (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'Missing date parameter' });

  const sql = `
    SELECT 
        g.id AS game_id,
        g.name AS game_name,
        e.id AS event_id,
        e.name AS event_name,
        e.gallery_id,
        e.default_day,
        e.g_name
    FROM games g
    LEFT JOIN event e ON g.id = e.gameid
    ORDER BY g.id, e.id
  `;

  const sqlAction = `
    SELECT 
        a.id AS action_id,
        a.eventid,
        a.status,
        a."date",
        a."from",
        a."to",
        a."type"
    FROM action a
    WHERE a.date = ?
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(sqlAction, [date], (err2, actions) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const result = {};

      for (const row of rows) {
        const gameId = row.game_id;
        if (!result[gameId]) {
          result[gameId] = {
            id: gameId,
            name: row.game_name,
            events: [],
            "event-details": []
          };
        }

        if (row.event_id) {
          result[gameId].events.push({
            id: row.event_id,
            name: row.event_name,
            gallery_id: row.gallery_id,
            default_day: row.default_day,
            g_name:  row.g_name,
          });
        }
      }

      // gán event-details vào đúng game
      for (const action of actions) {
        const game = Object.values(result).find(g =>
          g.events.some(ev => ev.id === action.eventid)
        );

        if (game) {
          game["event-details"].push({
            id: action.action_id,
            event_id: action.eventid,
            status: action.status,
            from: action.from || "",
            to: action.to || "",
            date: action.date,
            type: action.type
          });
        }
      }

      res.json(Object.values(result));
    });
  });
});

app.post('/getInfo', async (req, res) => {
  const { event_id } = req.body;
  try {
    const cookies = fs.existsSync('cookies.json') ? JSON.parse(fs.readFileSync('cookies.json')) : [];
    const csrfToken = fs.existsSync('csrfToken.txt') ? fs.readFileSync('csrfToken.txt', 'utf8') : '';

    if (cookies.length === 0 || !csrfToken) {
      res.status(500).json({ error: 'No cookies or CSRF token found. Please login first.' });
      return;
    }

    let form = new FormData();
    
    form.append('csrf', csrfToken);
    form.append('id', event_id);

    let response = await axios.post('https://my.liquidandgrit.com/action/admin/cms/blog/gallery-edit', form, {
      headers: {
        Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
        "Content-Type": "text/html; charset=UTF-8", 
      },
      responseType: "text"
    });

    data = JSON.parse(response.data);
 

    res.json({ success: true, result: data });

  } catch (err) {
    console.error("❌ Error calling Google Sheet:", err.message);
    res.status(500).json({ error: err.message });
    return;
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const cookies = fs.existsSync('cookies.json') ? JSON.parse(fs.readFileSync('cookies.json')) : [];

    if (cookies.length === 0) {
      res.status(500).json({ error: 'No cookies or CSRF token found. Please login first.' });
      return;
    }
    
    let form = new FormData1();
    for (const [key, value] of Object.entries(req.body)) {
      form.append(key, value);
    }
    form.append('file', req.file.buffer, req.file.originalname);

    const response = await axios.post('https://my.liquidandgrit.com/action/admin/cms/file-upload-v3', form, {
      headers: {
        Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
        "Content-Type": "text/html; charset=UTF-8", 
      },
    });

    // console.log(response);
    
    // const text = await response.text();
    // res.status(response.status).send(text);
    res.json({ success: true, result: "OK"});
  } catch (err) {
    console.error(err);
    res.status(500).send('Proxy error34');
  }
});

app.get('/events', async (req, res) => {
  const sql = `
    SELECT event.*, games.name AS gameName
    FROM event
    INNER JOIN games ON event.gameid = games.id
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(rows);
  });
});

app.get('/listGame', async (req, res) => {
  const sql = `
    SELECT * from games
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    res.json(rows);
  });
});


function getEventByIdAsync(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT event.*, games.name as gameName FROM event inner join games on event.gameid = games.id WHERE event.id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);

      const eventObject = {
        event_id: row.id,
        name: row.name,
        gallery_id: row.gallery_id,
        g_name: row.g_name,
        game_name: row.gameName
      };

      resolve(eventObject);
    });
  });
}

app.post('/event', (req, res) => {
  const { name, gallery_id, g_name, gameId, default_day, eventId } = req.body;

  if (!name || !gallery_id) {
    return res.status(400).json({ error: 'Thiếu dữ liệu: name, gallery_id là bắt buộc.' });
  }

 if (eventId) {
    // Trường hợp UPDATE
    const updateSql = `
      UPDATE event 
      SET name = ?, gallery_id = ?, g_name = ?, gameid = ?, default_day = ?
      WHERE id = ?
    `;
    db.run(updateSql, [name, gallery_id, g_name, gameId, default_day, eventId], function (err) {
      if (err) {
        console.error('❌ Update error:', err);
        return res.status(500).json({ error: 'Lỗi khi cập nhật sự kiện.' });
      }

      res.json({
        success: true,
        lastedId: eventId,
        name,
        gallery_id,
        g_name
      });
    });
  } else {
    // Trường hợp INSERT
    const insertSql = `
      INSERT INTO event (gameid, name, gallery_id, default_day, g_name)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(insertSql, [gameId, name, gallery_id, default_day, g_name], function (err) {
      if (err) {
        console.error('❌ Insert error:', err);
        return res.status(500).json({ error: 'Lỗi khi thêm sự kiện.' });
      }

      res.json({
        success: true,
        lastedId: this.lastID,
        name,
        gallery_id,
        g_name
      });
    });
  }
});


app.post('/action', async (req, res) => {
  const { id, event_id, date, from, to, type } = req.body;

  // console.log(dayjs(to).format("MMMM D, YYYY"));
  

  // return res.status(400).json({ error: 'Missing required fields' });

  if (!event_id || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const event = await getEventByIdAsync(event_id);

  if (!event) {
    return res.status(400).json({ error: 'không tìm thấy event' });
  }

  try {
    if(type != 'nochanged') {
      const cookies = fs.existsSync('cookies.json') ? JSON.parse(fs.readFileSync('cookies.json')) : [];
      const csrfToken = fs.existsSync('csrfToken.txt') ? fs.readFileSync('csrfToken.txt', 'utf8') : '';

      if (cookies.length === 0 || !csrfToken) {
              res.status(500).json({ error: 'No cookies or CSRF token found. Please login first.' });
        return;
      }

      let form = new FormData();
      form.append('csrf', csrfToken);

      form.append('action', "getEventsById");
      form.append('plugin', "event");
      form.append('cms_page_blog_gallery_id', event.gallery_id);


      

      console.log("bat dau goi");

      let response = await axios.post('https://my.liquidandgrit.com/action/admin/cms/plugin', form, {
        headers: {
          Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
          "Content-Type": "text/html; charset=UTF-8", 
        },
        responseType: "text"
      });

      let data = JSON.parse(response.data);
      
      
      form = new FormData();
      form.append('csrf', csrfToken);

      form.append('end', dayjs(to).format("MMMM D, YYYY"));
      form.append('start', dayjs(from).format("MMMM D, YYYY"));
      form.append('plugin', "event");
      form.append('name', (event.g_name || '') != '' ? event.name : '');
      form.append('action', "event_add_item");
      form.append('order_index', data.events.length);
      form.append('cms_page_blog_gallery_id', event.gallery_id);

      response = await axios.post('https://my.liquidandgrit.com/action/admin/cms/plugin', form, {
        headers: {
          Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
          "Content-Type": "text/html; charset=UTF-8", 
        },
        responseType: "text"
      });

      data = JSON.parse(response.data);

      console.log(data);
      

    }
 
    // return res.status(400).json({ error: 'dung xu ly' });

    let str = '';
    if(type == 'nochanged') {
      str = 'No Change';
    } else {
      const extra = type == 'image' ? `/ image ` : (type == 'video' ? '/ image/ video ' : '');
        str = (event.g_name || '') != '' ? `-Added tracker date ${extra}for ${event.g_name} ( ${event.name} )` : `-Added tracker date ${extra}for ${event.name}`
    }
     
    const params = {
      date: dayjs(date).format("DD/MM/YYYY"),
      name: event.game_name,
      events: [str]
    }

    response = await axios.post(GOOGLE_SCRIPT_URL, params, {
      headers: { "Content-Type": "application/json" }
    });

    // res.json({ success: true, result: response.data });


  } catch (err) {
    console.error("❌ Error calling Google Sheet:", err.message);
    res.status(500).json({ error: err.message });
    return;
  }


  if (id) {
    // Nếu có ID, kiểm tra xem đã thành công chưa
    const checkSql = `SELECT status FROM action WHERE id = ?`;
    db.get(checkSql, [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      if (row && row.status === '1') {
        // Nếu đã thành công thì bỏ qua
        return res.json({ id, status: row.status, message: "Already successful. No update." });
      }

      // Nếu chưa thành công → update và đặt lại status = '0'
      const updateSql = `
        UPDATE action
        SET eventid = ?, date = ?, "from" = ?, "to" = ?, status = '1'
        WHERE id = ?
      `;
      db.run(updateSql, [event_id, date, from || '', to || '', id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ id, status: '1', message: "Updated" });
      });
    });

  } else {
    // Nếu không có ID → insert mới với status = '1'
    const insertSql = `
      INSERT INTO action (eventid, date, status, "from", "to", type)
      VALUES (?, ?, '1', ?, ?,?)
    `;
    db.run(insertSql, [event_id, date, from || '', to || '', type], function (err3) {
      if (err3) return res.status(500).json({ error: err3.message });
      res.json({ id: this.lastID, status: '1', message: "Inserted" });
    });
  }
});

app.post('/actions', (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Payload must be an array' });
  if (records.length === 0) return res.json([]);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const results = [];
    let hasError = false;
    let pending = records.length;

    const finish = () => {
      if (hasError) {
        db.run("ROLLBACK", () => res.status(500).json({ error: 'Transaction rolled back', results }));
      } else {
        db.run("COMMIT", () => res.json(results));
      }
    };

    records.forEach((record) => {
      const { id, event_id, date, from, to, status, isDelete, type } = record;

      if (id) {
        // Kiểm tra nếu đã status = '1' thì bỏ qua
        db.get(`SELECT status FROM action WHERE id = ?`, [id], (err, row) => {
          if (err) {
            hasError = true;
            results.push({ error: err.message, record });
            if (--pending === 0) finish();
            return;
          }

          if (row?.status === '1') {
            results.push({ id, status: '1', message: 'Already success. Skipped.' });
            if (--pending === 0) finish();
            return;
          }

          if(isDelete) {
            db.run(
              `DELETE FROM action WHERE id = ?;`,
              [id],
              function (err2) {
                if (err2) {
                  hasError = true;
                  results.push({ error: err2.message, record });
                } else {
                  results.push({ id, status: status || '0' });
                }
                if (--pending === 0) finish();
              }
            );

            return;
          } 

          // Nếu chưa thành công → UPDATE
          db.run(
            `UPDATE action SET eventid = ?, date = ?, "from" = ?, "to" = ?, status = ?, type=? WHERE id = ?`,
            [event_id, date, from || '', to || '', status || '0', type, id],
            function (err2) {
              if (err2) {
                hasError = true;
                results.push({ error: err2.message, record });
              } else {
                results.push({ id, status: status || '0' });
              }
              if (--pending === 0) finish();
            }
          );
        });
      } else {
        // INSERT
        db.run(
          `INSERT INTO action (eventid, date, status, "from", "to", type) VALUES (?, ?, ?, ?, ?, ?)`,
          [event_id, date, status || '0', from || '', to || '', type],
          function (err3) {
            if (err3) {
              hasError = true;
              results.push({ error: err3.message, record });
            } else {
              results.push({ id: this.lastID, status: status || '0' });
            }
            if (--pending === 0) finish();
          }
        );
      }
    });
  });
});



// Hàm đăng nhập và lấy cookie, csrf token
async function login() {
   const executablePath = await computeSystemExecutablePath({
    cacheDir: './node_modules/@puppeteer/browsers/.cache',
    browser: 'chrome',
    buildId: '1266938' // Chrome Stable revision phù hợp
  });

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  await page.goto('https://my.liquidandgrit.com/admin/login', { waitUntil: 'networkidle2' });
  // Điền thông tin vào ô username và password
 await page.type('input[name="email"]', 'trancongphanvinh@gmail.com');  // Sửa lại "your_username" thành tên đăng nhập thực tế
 await page.type('input[name="password"]', 'tracker01');  // Sửa lại "your_password" thành mật khẩu thực tế
 
 // Nhấn nút đăng nhập
 await page.click('#submit');  // Sửa lại selector nếu cần để đúng với nút đăng nhập
 
  // Nhấn nút đăng nhập
  await page.click('#submit');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Lấy cookie và CSRF token
  const cookies = await page.cookies();
  const csrfToken = await page.evaluate(() => {
    return window.csrfHash || null;  // Lấy csrfHash từ trang
  });

  // Đóng trình duyệt
  await browser.close();

  return { csrfToken, cookies };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname)); // lưu ở thư mục hiện tại (cùng server.js)
  },
  filename: (req, file, cb) => {
    cb(null, 'sample_game_db.sqlite'); // tên cố định → ghi đè mỗi lần upload
  }
});

const upload1 = multer({ storage });

// 📥 API upload
app.post('/upload-sqlite', upload1.single('sqlite_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  console.log('Đã ghi đè file:', req.file.path);
  res.status(200).send('Upload thành công');
});

// 📤 API download file mẫu
app.get('/template-sqlite.db', (req, res) => {
  const filePath = path.join(__dirname, 'sample_game_db.sqlite'); // ← KHÔNG có "public/"
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Không tìm thấy file mẫu');
  }
});

function getGameByIdAsync(gameId) {

  return new Promise((resolve, reject) => {
    db.get("SELECT * from games WHERE id = ?", [gameId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);

      const eventObject = {
        tagId: row.tagId,
      };

      resolve(eventObject);
    });
  });
}

app.post('/search-gallery', async (req, res) => {
  const { search_keyword, gameId } = req.body;
  try {
      if(!gameId) {
          res.status(500).json({ error: 'Tim theo game truoc' });
          return;
      };
    const cookies = fs.existsSync('cookies.json') ? JSON.parse(fs.readFileSync('cookies.json')) : [];
    const csrfToken = fs.existsSync('csrfToken.txt') ? fs.readFileSync('csrfToken.txt', 'utf8') : '';

    if (cookies.length === 0 || !csrfToken) {
            res.status(500).json({ error: 'No cookies or CSRF token found. Please login first.' });
      return;
    }

    let tagId = ''

    const game = await getGameByIdAsync(gameId);

    if (game) {
      tagId = game.tagId;
    }

    const obj = JSON.parse('{"category": [], "page": 0, "sort": ["publish_date", "desc"], "tag26": ["136034"], "tag_group_data": 1, "matrix_app_features": 0, "date_range": "", "limit": 0, "init": 0, "tag37": [], "tag38": [], "tag34": [], "tag28": [], "tag18": [], "tag29": [], "tag36": [], "tag45": [], "tag9": [], "tag42": [], "tag32": [], "tag4": [], "tag1": [], "tag2": [], "tag3": [], "tag10": [], "tag12": [], "tag7": [], "tag8": [], "tag11": [], "tag43": [], "tag13": [], "tag22": [], "tag21": [], "search": ""}');
    obj.tag18 = [tagId.toString()];
    let form = new FormData();

        form.append('csrf', csrfToken);

    form.append('cnd_config_dir', "/cms/blog/gallery");
    form.append('config_case', "gallery");
    form.append('id', '1');
    form.append('vo-action', '');
    form.append('filter_conditions', JSON.stringify(obj))
    
    console.log(form);
    

    console.log("bat dau goi");

    let response = await axios.post('https://my.liquidandgrit.com/action/public/cms/blog/cnd', form, {
      headers: {
        Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
        "Content-Type": "text/html; charset=UTF-8", 
      },
      responseType: "text"
    });

    let data = JSON.parse(response.data);
    // console.log(data);

    const $ = cheerio.load(data.content_html);
    const rows = $('table.view-data tbody tr');

    const matchedRows = [];

    rows.each((i, row) => {
      const link = $(row).find('td a.vo-permalink-url');
      const cells = $(row).find('td');
      
      // console.log(link.attr('data-info'));

      // console.log(link.attr('href'));

      if (
  (search_keyword || '') === '' ||
  $(cells[0]).text().toLowerCase().includes(search_keyword.toLowerCase()) ||
  $(cells[2]).text().toLowerCase().includes(search_keyword.toLowerCase())
) {
            matchedRows.push({
              title: $(cells[0]).text(),
              href: link.attr('href'),
              sub: $(cells[2]).text(),
            })
      }
      
      // console.log($(cells[0]).text(), $(cells[2]).text());
    });

    res.json(Object.values(matchedRows));


  } catch (err) {
    console.error("❌ Error ", err.message);
    res.status(500).json({ error: err.message });
    return;
  }
});

app.post('/get-gallery-info', async (req, res) => {
const { galleryName , gameId} = req.body;
  try {
      if(!galleryName || !gameId) {
          res.status(500).json({ error: 'Nhập input truoc' });
          return;
      };
    const cookies = fs.existsSync('cookies.json') ? JSON.parse(fs.readFileSync('cookies.json')) : [];
    const csrfToken = fs.existsSync('csrfToken.txt') ? fs.readFileSync('csrfToken.txt', 'utf8') : '';

    if (cookies.length === 0 || !csrfToken) {
      res.status(500).json({ error: 'No cookies or CSRF token found. Please login first.' });
      return;
    }

    let tagId = ''

    const game = await getGameByIdAsync(gameId);

    if (game) {
      tagId = game.tagId;
    }

    const obj = JSON.parse('{"limit": 10, "init": 0, "page": 0, "type": [], "status": [], "category": [], "non_category": [], "tag37": [], "tag38": [], "tag28": [], "tag34": [], "tag18": ["768367"], "tag35": [], "tag21": [], "tag29": [], "tag36": [], "tag22": [], "tag26": [], "tag45": [], "tag42": [], "tag9": [], "tag32": [], "tag4": [], "tag1": [], "tag2": [], "tag3": [], "tag10": [], "tag12": [], "tag7": [], "tag8": [], "tag11": [], "tag43": [], "tag13": [], "search": ""}');
    obj.tag18 = [tagId.toString()];
    obj.search = galleryName;

    let form = new FormData();
    form.append('csrf', csrfToken);
    form.append('id', '1');
    form.append('vo-action', '');
    form.append('filter_conditions', JSON.stringify(obj))

      

    console.log("bat dau goi");

    let response = await axios.post('https://my.liquidandgrit.com/action/admin/cms/blog/post-cnd', form, {
      headers: {
        Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
        "Content-Type": "text/html; charset=UTF-8", 
      },
      // responseType: "text"
    });

    // let data = JSON.parse(response.data);
    // console.log(response.data);

    console.log(response.data.content);
    
    res.json(response.data.content.find(item=> item.name == galleryName) || {});


  } catch (err) {
    console.error("❌ Error ", err.message);
    res.status(500).json({ error: err.message });
    return;
  }

});

// Serve static files from React build folder
app.use(express.static(path.join(__dirname, 'build')));

// Fallback: trả về index.html với các route frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
