const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
let userId = 0;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register", async (request, response) => {
  let userID;
  const getLastElementID = `SELECT user_id FROM user  ORDER BY user_id DESC LIMIT 1`;
  const { user_id } = await db.get(getLastElementID);
  userID = user_id + 1;
  const { username, password, name, gender } = request.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log(hashedPassword);
      const createUserQuery = `
      INSERT INTO 
        user (user_id,name,username,password,gender) 
      VALUES 
        (
           ${userID}, 
           '${name}',
          '${username}',
          '${hashedPassword}', 
          '${gender}'
          
        )`;
      const dbResponse = await db.run(createUserQuery);
      console.log(dbResponse);
      request.status = 200;
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      user.username  as username,
      tweet.tweet as tweet,
      tweet.date_time as dateTime
    FROM
      user inner join tweet  on user.user_id = tweet.user_id`;
  const statesArray = await db.all(getStatesQuery);
  response.send(statesArray);
});

// API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      user.name as name
    FROM
      user inner join follower  on user.user_id = follower.following_user_id`;

  const statesArray = await db.all(getStatesQuery);
  response.send(statesArray);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
      user.name as name
    FROM
      user inner join follower  on user.user_id = follower.follower_user_id`;

  const statesArray = await db.all(getStatesQuery);
  response.send(statesArray);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const getTweetQuery = `
   SELECT
    tweet.tweet as tweet,
    count(distinct  like.like_id ) as likes,
    count( distinct reply.reply_id ) as replies,
    tweet.date_time as dateTime
    FROM
  tweet  join  follower on tweet.user_id =follower.following_user_id  
   join reply on tweet.tweet_id = reply.tweet_id join like on reply.tweet_id=like.tweet_id

   where
   tweet.tweet_id =${tweetId}
    ;`;
  const tweetArray = await db.get(getTweetQuery);
  const { tweet } = tweetArray;
  if (tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweetArray);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
   SELECT
    distinct user.username as username
    FROM
    user join like on user.user_id = like.user_id join tweet on tweet.tweet_id = like.tweet_id join
    follower on follower.following_user_id = tweet.user_id
   where
   tweet.tweet_id =${tweetId}
   ;`;
    const userArray = await db.all(getTweetQuery);
    let userList = [];

    if (userArray === []) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      for (obj of userArray) {
        userList.push(obj.username);
      }
      response.send({ likes: userList });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `
   SELECT
    distinct user.name as name,
     reply.reply as reply
    FROM
    user join reply on user.user_id = reply.user_id join tweet on tweet.tweet_id = reply.tweet_id join
    follower on follower.following_user_id = tweet.user_id
   where
   tweet.tweet_id =${tweetId}
   ;`;
    const userArray = await db.all(getTweetQuery);
    let userList = [];

    if (userArray === []) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: userArray });
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getTweetQuery = `
   SELECT
    distinct  tweet.tweet as tweet,
    count(  like.like_id ) as likes,
    count (  reply.reply_id ) as replies,
    tweet.date_time as dateTime
    FROM
    user join tweet on user.user_id = tweet.user_id
   join reply on tweet.tweet_id = reply.tweet_id join like on reply.tweet_id=like.tweet_id

   
    ;`;
  const tweetArray = await db.all(getTweetQuery);
  const { tweet } = tweetArray;
  if (tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweetArray);
  }
});
