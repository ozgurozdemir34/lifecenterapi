const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const qr = require("qrcode");

const app = express();

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// CORS middleware
app.use(cors());

// MySQL connection
const baglanti = mysql.createConnection({
  host: "localhost",
  database: "veritabani",
  user: "root",
  password: ""
});

baglanti.connect((err) => {
  if (err) {
    console.error('Bağlantı hatası: ' + err.stack);
    return;
  }
  console.log('Bağlandık ID ' + baglanti.threadId);
});

// CORS settings
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// User registration endpoint for "uyeler" table
app.post("/uyekayit", async (req, res) => {
  const { kullaniciadi, ad, soyad, kangrubu, ceptelefonu, meslek, ozeldurum, dogumtarihi, cinsiyet,brans,baslangictarihi,bitistarihi,paketid } = req.body;

  if (!kullaniciadi || !ad || !soyad || !kangrubu || !ceptelefonu || !meslek || !ozeldurum || !dogumtarihi || !cinsiyet||!brans||!bitistarihi||!baslangictarihi||!paketid) {
    console.log(req.body);
    return res.status(400).send('Eksik parametreler');
  }

  try {
    // Kullanıcıyı kontrol et
    const [userResults] = await baglanti.promise().query("SELECT id FROM salonsahipleri WHERE kullaniciadi=?", [kullaniciadi]);
    if (userResults.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = userResults[0].id;

    // Yeni ID'yi belirle
    const [[maxIdResult]] = await baglanti.promise().query("SELECT MAX(id) as maxId FROM uyeler");
    const maxId = maxIdResult.maxId || 0;
    const yeniId = maxId + 1;

    

    // QR kodunu oluştur
    const qrCodeDataUrl = await qr.toDataURL(``);

    // Kullanıcıyı ekle
    await baglanti.promise().query("INSERT INTO uyeler (id, ad, soyad, salonid, sontarih, kayittarih, dogumtarihi, meslek, kangrubu, telefon, ozeldurum, cinsiyet, qr,brans,paketid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)",
      [yeniId, ad, soyad, salonid, bitistarihi, baslangictarihi, dogumtarihi, meslek, kangrubu, ceptelefonu, ozeldurum, cinsiyet, qrCodeDataUrl,brans,paketid]);

    return res.status(201).json({ "Başarılı": "Başarılı" });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Sunucu hatası");
  }
});

// User authentication endpoint
app.get("/salonsahipsorgu", (req, res) => {
  const kullaniciadi = req.query.kullaniciadi;
  const sifre = req.query.sifre;

  if (!kullaniciadi || !sifre) {
    return res.status(400).send('Eksik parametreler');
  }

  baglanti.query(
    'SELECT * FROM salonsahipleri WHERE kullaniciadi = ?',
    [kullaniciadi],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Veritabanı sorgu hatası');
      }

      if (results.length === 0) {
        return res.status(401).send('Kullanıcı bulunamadı');
      }

      const user = results[0];
      bcrypt.compare(sifre, user.sifre, (err, isMatch) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Şifre kontrol hatası');
        }

        if (!isMatch) {
          return res.status(500).send("Yanlış şifre");
        } else {
          return res.json(user);
        }
      });
    }
  );
});

// User registration endpoint for "salonsahipleri" table
app.post("/salonsahipkayit", (req, res) => {
  const { kullaniciadi, sifre, salonadi, email } = req.body;

  if (!kullaniciadi || !sifre || !salonadi || !email) {
    return res.status(400).send('Eksik parametreler');
  }

  baglanti.query(
    'SELECT * FROM salonsahipleri WHERE kullaniciadi = ? OR email = ?',
    [kullaniciadi, email],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Veritabanı sorgu hatası');
      }

      if (results.length > 0) {
        return res.status(409).send('Bu kullanıcı adı veya email zaten kayıtlı');
      } else {
        bcrypt.hash(sifre, 10, (err, hashedPassword) => {
          if (err) {
            console.error(err);
            return res.status(500).send('Şifre hashleme hatası');
          }

          baglanti.query('SELECT COUNT(*) AS count FROM salonsahipleri', (err, results) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Veritabanı sorgu hatası');
            }

            const salonid = results[0].count + 1;

            baglanti.query(
              'INSERT INTO salonsahipleri (id, kullaniciadi, sifre, salonadi, email) VALUES (?, ?, ?, ?, ?)',
              [salonid, kullaniciadi, hashedPassword, salonadi, email],
              (err, results) => {
                if (err) {
                  console.error(err);
                  return res.status(500).send('Veritabanı sorgu hatası');
                }
                return res.status(201).json({ "Başarılı": "Başarılı" });
              }
            );
          });
        });
      }
    }
  );
});

// Get users based on "kullaniciadi"
app.get("/uyeler", (req, res) => {
  const kullaniciadi = req.query.kullaniciadi;

  if (!kullaniciadi) {
    return res.status(400).send('Eksik parametreler');
  }

  baglanti.query("SELECT id FROM salonsahipleri WHERE kullaniciadi=?", [kullaniciadi], (err, results) => {
    if (err) {
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = results[0].id;

    baglanti.query("SELECT * FROM uyeler WHERE salonid=?", [salonid], (err, results) => {
      if (err) {
        return res.status(500).send("Veritabanı sorgu hatası");
      }
      
      return res.json(results);
    });
  });
});

app.get("/uyebilgileri/:id", (req, res) => {
  const id = req.params.id;
  baglanti.query("SELECT * FROM uyeler WHERE id = ?", [id], (err, results) => {
    if (err) {
      return res.status(500).send("Veritabanı sorgu hatası");
    }
    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }
    return res.json(results[0]);
  });
});

app.post("/uyeguncelle/:id", (req, res) => {
  const id = req.params.id;
  const { ad, soyad, meslek, ceptelefonu, ozeldurum, kangrubu, cinsiyet, dogumtarihi, bakiye,brans ,baslangictarihi,bitistarihi} = req.body;

  if (!id || !ad || !soyad|| !meslek || !ceptelefonu || !ozeldurum || !kangrubu || !cinsiyet ||!brans||!baslangictarihi||!bitistarihi||!dogumtarihi) {
    return res.status(400).send('Eksik parametreler');
  }

  

  baglanti.query("UPDATE uyeler SET ad = ?, soyad = ?, sontarih = ?, kayittarih = ?, meslek = ?, telefon = ?, ozeldurum = ?, kangrubu = ?, cinsiyet = ?, dogumtarihi = ?, bakiye = ?,brans=? WHERE id = ?",
    [ad, soyad, bitistarihi,baslangictarihi , meslek, ceptelefonu, ozeldurum, kangrubu, cinsiyet, dogumtarihi, bakiye,brans, id], (err, results) => {
    if (err) {
      return res.status(500).send("Veritabanı güncelleme hatası");
    }
    return res.json({ "Başarılı": "Başarılı" });
  });
});
app.get("/potansiyeluye", (req, res) => {
  // Kullanıcı adını query parametresi olarak al
  const kullaniciadi = req.query.kullaniciadi;

  if (!kullaniciadi) {
    return res.status(400).send("Kullanıcı adı sağlanmadı");
  }

  // İlk olarak salon sahibinin id'sini bul
  baglanti.query("SELECT id FROM salonsahipleri WHERE kullaniciadi = ?", [kullaniciadi], (err, results) => {
    if (err) {
      console.error("Veritabanı sorgu hatası:", err);
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = results[0].id;

    // Salon ID'sine göre potansiyel üyeleri getir
    baglanti.query("SELECT * FROM potansiyeluye WHERE salonid = ?", [salonid], (err, results) => {
      if (err) {
        console.error("Veritabanı sorgu hatası:", err);
        return res.status(500).send("Veritabanı sorgu hatası");
      }

      return res.json(results);
    });
  });
});

app.post("/potansiyeluyekaydet", (req, res) => {
  const { ad, soyad, telefon,kullaniciadi } = req.body;
  

  if (!ad || !soyad || !telefon||!kullaniciadi) {
    return res.status(400).send('Eksik parametreler');
  }
  
  baglanti.query("SELECT id FROM salonsahipleri WHERE kullaniciadi=?", [kullaniciadi], (err, results) => {
    if (err) {
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = results[0].id;
  // En yüksek id değerini bul
  const maxIdQuery = "SELECT MAX(id) as maxId FROM potansiyeluye";
  baglanti.query(maxIdQuery, (err, results) => {
    if (err) {
      console.error("Veritabanı sorgu hatası:", err);
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    const maxId = results[0].maxId || 0;
    const yeniId = maxId + 1;

    // Yeni kayıt ekle
    const insertQuery = "INSERT INTO potansiyeluye (id, ad, soyad, telefon,salonid) VALUES (?, ?, ?, ?,?)";
    const values = [yeniId, ad, soyad, telefon,salonid];

    baglanti.query(insertQuery, values, (err, results) => {
      if (err) {
        console.error("Veritabanı sorgu hatası:", err);
        return res.status(500).send("Veritabanı sorgu hatası");
      }
      return res.status(201).json({ "Başarılı": "Başarılı" });
    
    })
    });
  });
});
app.post("/personelkaydet", (req, res) => {
  const { ad, soyad, telefon,kullaniciadi,brans } = req.body;
  

  if (!ad || !soyad || !telefon||!kullaniciadi||!brans) {
    return res.status(400).send('Eksik parametreler');
  }
  
  baglanti.query("SELECT id FROM salonsahipleri WHERE kullaniciadi=?", [kullaniciadi], (err, results) => {
    if (err) {
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = results[0].id;
  // En yüksek id değerini bul
  const maxIdQuery = "SELECT MAX(id) as maxId FROM personeller";
  baglanti.query(maxIdQuery, (err, results) => {
    if (err) {
      console.error("Veritabanı sorgu hatası:", err);
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    const maxId = results[0].maxId || 0;
    const yeniId = maxId + 1;

    // Yeni kayıt ekle
    const insertQuery = "INSERT INTO personeller (id, ad, soyad, telefon,salonid,brans) VALUES (?, ?, ?, ?,?,?)";
    const values = [yeniId, ad, soyad, telefon,salonid,brans];
    
    baglanti.query(insertQuery, values, (err, results) => {
      if (err) {
        console.error("Veritabanı sorgu hatası:", err);
        return res.status(500).send("Veritabanı sorgu hatası");
      }
      return res.status(201).json({ "Başarılı": "Başarılı" });
    
    })
    });
  });
});
app.get("/personeller", (req, res) => {
  // Kullanıcı adını query parametresi olarak al
  const kullaniciadi = req.query.kullaniciadi;

  if (!kullaniciadi) {
    return res.status(400).send("Kullanıcı adı sağlanmadı");
  }

  // İlk olarak salon sahibinin id'sini bul
  baglanti.query("SELECT id FROM salonsahipleri WHERE kullaniciadi = ?", [kullaniciadi], (err, results) => {
    if (err) {
      console.error("Veritabanı sorgu hatası:", err);
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = results[0].id;

    // Salon ID'sine göre potansiyel üyeleri getir
    baglanti.query("SELECT * FROM personeller WHERE salonid = ?", [salonid], (err, results) => {
      if (err) {
        console.error("Veritabanı sorgu hatası:", err);
        return res.status(500).send("Veritabanı sorgu hatası");
      }

      return res.json(results);
    });
  });
});

app.post("/dondurmaekle",(req,res)=>{
  const {id,baslangictarihi,bitistarihi}=req.body

  baglanti.query("INSERT INTO dondurmalar(id,dondurmabaslangic,dondurmabitis) VALUES(?,?,?)",[id,baslangictarihi,bitistarihi],(err,results)=>{
    if (err) {
      console.error(err)
      return res.status(500).send("Hata: ",err)
    }
    else{
     return res.status(201).json("Başarılı:başarılı")
    }
  })
})
app.get('/dondurmagetir', (req, res) => {
  const kullaniciadi = req.query.kullaniciadi; // GET parametresinden kullaniciadi alınır

  // SQL sorgusu
  const sql = `
    SELECT 
      uyeler.id AS uye_id,
      uyeler.ad AS uye_ad,
      uyeler.soyad AS uye_soyad,
      uyeler.salonid AS uye_salonid,
      dondurmalar.id AS dondurma_id,
      dondurmalar.dondurmabaslangic AS dondurmabaslangic,
      dondurmalar.dondurmabitis AS dondurmabitis
    FROM 
      uyeler
    INNER JOIN 
      dondurmalar 
    ON 
      uyeler.id = dondurmalar.id
    INNER JOIN
      salonsahipleri
    ON
      uyeler.salonid = salonsahipleri.id
    WHERE 
      salonsahipleri.kullaniciadi = ?
  `;

  // Sorguyu çalıştır
  baglanti.query(sql, [kullaniciadi], (err, results) => {
    if (err) {
      console.error('SQL Hatası:', err);
      return res.status(500).send('Sunucu Hatası');
    }
    res.json(results);
  });
});

app.get("/paketler",(req,res)=>{
  const kullaniciadi=req.query.kullaniciadi
  if (!kullaniciadi) {
    return res.status(400).send("Kullanıcı adı sağlanmadı");
  }
  baglanti.query("SELECT id FROM salonsahipleri WHERE kullaniciadi=?", [kullaniciadi], (err, results) => {
    if (err) {
      return res.status(500).send("Veritabanı sorgu hatası");
    }

    if (results.length === 0) {
      return res.status(404).send("Kullanıcı bulunamadı");
    }

    const salonid = results[0].id;

    baglanti.query("SELECT*FROM paketler WHERE salonid=?",[salonid],(err,results)=>{

      if (err) {
        return res.status(501).send("Veritabanı hatası",err)
      }
      return res.json(results)
    })

    
  });
  }
)

app.post("/paketekle", (req, res) => {
  const { paketadi, kullaniciadi, fiyat, dondurmahakki } = req.body;
   if(!paketadi,!kullaniciadi,!fiyat,!dondurmahakki){
    return res.status(404).send("Olmadı")
   }
  // En son id değerini almak için
  const getLastIdQuery = 'SELECT MAX(id) AS maxId FROM paketler';
  baglanti.query(getLastIdQuery, (err, result) => {
    if (err) return res.status(500).send("Max İd seçilemedi",err);

    const lastId = result[0].maxId || 0;
    const newId = lastId + 1;

    // uyeler tablosundan salonid almak için
    const getSalonIdQuery = 'SELECT id FROM salonsahipleri WHERE kullaniciadi = ?';
    baglanti.query(getSalonIdQuery, [kullaniciadi], (err, result) => {
      if (err) return res.status(500).send("İd seçilemedi",err)

      if (result.length === 0) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      const salonid = result[0].id;

      // Yeni paketi paketler tablosuna eklemek için
      const addPackageQuery = 'INSERT INTO paketler (paketadi, id, salonid, fiyat, dondurmahakki) VALUES (?, ?, ?, ?, ?)';
      baglanti.query(addPackageQuery, [paketadi, newId, salonid, fiyat, dondurmahakki], (err, result) => {
        if (err) return res.status(500).json({ error: err });

        res.status(201).json({ message: 'Paket başarıyla eklendi' });
      });
    });
  });
});

app.get("/paketgetir", (req, res) => {
  const kullaniciadi = req.query.kullaniciadi;

  // Önce uyeler tablosundan kullaniciadi'na göre id'yi çekelim
  const queryForUserId = "SELECT id FROM salonsahipleri WHERE kullaniciadi = ?";
  baglanti.query(queryForUserId, [kullaniciadi], (error, results) => {
      if (error) {
          console.error(error)
          return res.status(500).send("Veritabanı hatası");
          
      }

      if (results.length === 0) {
          return res.status(404).send("Kullanıcı bulunamadı");
      }

      const userId = results[0].id;

      // Şimdi paketler tablosundan salonid'ye göre paketleri çekelim
      const queryForPackages = "SELECT * FROM paketler WHERE salonid = ?";
      baglanti.query(queryForPackages, [userId], (error, paketResults) => {
          if (error) {
            console.error(error)
              return res.status(500).send("Veritabanı hatası");
          }

          res.json(paketResults);
      });
  });
});



// Start server
app.listen(3000, () => {
  console.log("Server çalışıyor: http://localhost:3000");
});
