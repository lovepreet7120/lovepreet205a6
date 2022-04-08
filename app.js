let express = require('express');
let handlebars  = require('express-handlebars');
const expsessions = require('express-session');

let { Client } = require('pg');

let app = express();
let router = express.Router();

app.use(express.urlencoded({extended: true}));
app.engine('.hbs', handlebars.engine({extname: '.hbs'}));
app.set('view engine', '.hbs');
app.set('layouts', './static/layouts');
app.set('views', './static/');

app.use(express.static('static'));

app.use(expsessions({
  secret: "secretKey",
  saveUninitialized:true,
  cookie: { maxAge: 24 * 3600 * 1000 },
  resave: false 
}));

app.use(router);

let port = process.env.PORT || 3000;
let userid;

let client = new Client({
  connectionString: process.env.DATABASE_URL,
  
  ssl: {
    rejectUnauthorized: false
  }
  
})
client.connect()

let handlebar = handlebars.create({})
handlebar.handlebars.registerHelper('equals', function(arg1, arg2, options) {
  return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
})

let session;

router.get('/', (req, res) => {
  res.render('home')
});

router.get('/home', (req, res) => {
  res.render('home')
});

router.get('/dashboard', (req, res) => {
  if(req.session.user === 'user') {
    res.render('dashboard', { fullname: req.query.fullname, username: req.query.username })
  } else {
    res.redirect('/login');
  }
});

router.get('/admin-dashboard', (req, res) => {
  if(req.session.user === 'admin') {
    res.render('admin-dashboard', { fullname: req.query.fullname, username: req.query.username })
  } else {
    res.redirect('/login');
  }
})

router.post('/admin-dashboard', (req, res) => {
  let data = {
    type: req.body.type,
    price: req.body.price,
    domains: req.body.domains,
    websites: req.body.websites,
    storage: req.body.storage,
    cdn: req.body.cdn,
    backup: req.body.backup,
    ssl: req.body.ssl,
    flagship: req.body.flagship ?? "FALSE"
  }

  let query = {
    name: 'create-plan',
    text: `INSERT INTO plans (type, price, domains, websites, storage, cdn, backup, ssl, flagship) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    values: [data.type, data.price, data.domains, data.websites, data.storage, data.cdn, data.backup, data.ssl, data.flagship]
  }
  
  client.query(query, (error, response) => {
    if (error) {
      console.log(error.stack)
    } else {
      res.redirect('/plans')
    }
  })
})

router.get('/plans', (req, res) => {
  let query = {
    name: 'plans',
    text: 'SELECT * FROM plans'
  }
  
  client.query(query, (error, response) => {
    if (error) {
      console.log(error.stack)
    } else {
      res.render('cwh', { plans: response.rows, user: req.session.user })  
    }
  })
});

router.get('/plans/:id', (req, res) => {
  if(req.session.user === 'admin') {
    let query = {
      name: 'plan',
      text: 'SELECT * FROM plans WHERE id=$1',
      values: [req.params.id]
    }
    
    client.query(query, (error, response) => {
      if (error) {
        console.log(error.stack)
      } else {
        res.render('edit', { plan: response.rows[0] })  
      }
    })
  } else {
    res.redirect('/plans');
  }
})

router.post('/edit-plan', (req, res) => {
  if(req.session.user === 'admin') {
    let query = {
      name: 'update-plan',
      text: 'UPDATE plans SET type=$1, price=$2, domains=$3, websites=$4, storage=$5, cdn=$6, backup=$7, ssl=$8, flagship=$9 WHERE id=$10',
      values: [req.body.type, req.body.price, req.body.domains, req.body.websites, req.body.storage, req.body.cdn, req.body.backup, req.body.ssl, req.body.flagship, req.body.id]
    }
    
    client.query(query, (error, response) => {
      if (error) {
        console.log(error.stack)
      } else {
        res.redirect('/plans')
      }
    })
  } else {
    res.redirect('/plans');
  }
})

router.get('/login', (req, res) => {
  res.render('login')
});

router.post('/login', (req, res) => {
  let data = {
    username: req.body.username,
    password: req.body.password,
    error_username: (req.body.username.trim() === "" || !/^[a-zA-Z0-9]+$/.test(req.body.username)) ? "Username must use a-z, A-Z, 0-9 only" : "",
    error_password: req.body.password.trim() === "" ? "Password cannot be empty" : ""
  }

  if(data.error_username.length > 0 || data.error_password.length > 0) {
    res.render('login', data)
  } else {
    let query = {
      name: 'user',
      text: `SELECT * FROM users WHERE username = $1 AND password = crypt($2, password)`,
      values: [data.username, data.password]
    }
    
    client.query(query, (error, response) => {
      if (error) {
        console.log(error.stack)
      } else {
        if(response.rowCount !== 0) {
          session = req.session;
          session.user = response.rows[0]['admin'] === 'YES' ? 'admin' : 'user';
          userid = response.rows[0]['id'];
          
          if(response.rows[0]['admin'] === 'YES') {
            res.redirect('/admin-dashboard'+'?fullname='+response.rows[0]['fullname']+'&username='+response.rows[0]['username'])
          } else {
            res.redirect('/dashboard'+'?fullname='+response.rows[0]['fullname']+'&username='+response.rows[0]['username'])
          }
        }
        else {
          res.render('login', {
            error_password: "Invalid Username and/or Password"
          })
        }
      }
    })
  }
})

router.get('/registration', (req, res) => {
  res.render('registration')
});

router.post('/registration', (req, res) => {
  let data = {
    name: req.body.name,
    username: req.body.username,
    password: req.body.password,
    company: req.body.company,
    position: req.body.position,
    phone: req.body.phone,
    admin: req.body.admin,
    error_name: (req.body.name.trim() === "" || !/^[a-zA-Z]+$/.test(req.body.name)) ? "Name contains a-z or A-Z only" : "",
    error_username: (req.body.username.trim() === "" || !/^[a-zA-Z0-9]+$/.test(req.body.username)) ? "Username must use a-z, A-Z, 0-9 only" : "",
    error_password: (req.body.password.trim() === "" || !/^([a-zA-Z0-9]){6,12}$/.test(req.body.password)) ? "Password length must be 6-12 with no special chars" : "",
    error_company: (req.body.company.trim() === "" || !/^([a-zA-Z0-9]){1,30}$/.test(req.body.company)) ? "Company name can be 1-30 chars long" : "",
    error_position: (req.body.position.trim() === "" || !/^([a-zA-Z0-9]){1,20}$/.test(req.body.position)) ? "Position can be 1-20 chars long" : "",
    error_phone: (req.body.phone.trim() === "" || !/^([0-9]){1,14}$/.test(req.body.phone)) ? "Phone can be 1-14 digits long" : ""
  }

  if(data.error_name.length > 0 || data.error_username.length > 0 || data.error_password.length > 0 || data.error_company.length > 0 || data.error_position.length > 0 || data.error_phone.length > 0) {
    res.render('registration', data)
  } else {
    let query = {
      name: 'register',
      text: `INSERT INTO users (fullname, username, password, company, position, phone) VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, $6)`,
      values: [data.name, data.username, data.password, data.company, data.position, data.phone]
    }
    
    client.query(query, (error, response) => {
      if (error) {
        console.log(error.stack)
      } else {
        res.redirect('/login')
      }
    })
  }
});

router.get('/cart/:id', (req, res) => {
  if(req.session.user === 'user') {
    let query = {
      name: 'cart',
      text: 'SELECT * FROM plans WHERE id=$1',
      values: [req.params.id]
    }
    
    client.query(query, (error, response) => {
      if (error) {
        console.log(error.stack)
      } else {
        res.render('cart', { plan: response.rows[0] })  
      }
    })
  } else {
    res.redirect('/dashboard');
  }
})

router.get('/checkout/:id', (req, res) => {
  if(req.session.user === 'user') {
    let query = {
      name: 'update-user',
      text: 'UPDATE users SET plan=$1 WHERE id=$2',
      values: [req.params.id, userid]
    }
    
    client.query(query, (error, response) => {
      if (error) {
        console.log(error.stack)
      } else {
        res.json({ status: 'Plan added to user account successfully'});  
      }
    })
  } else {
    res.redirect('/dashboard');
  }
})

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
})

app.listen(port, function () {
  console.log(`Listening at http://localhost:${port}`)
});