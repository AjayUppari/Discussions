const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running At http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error is ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (authHeaders === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretKey", async (error, payload) => {
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

// API-1 create new user
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserExists = `
  SELECT username
  FROM user
  WHERE username = '${username}';`;

  const userExistsResult = await db.get(checkUserExists);
  if (userExistsResult !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createUser = `
    INSERT INTO user
    (name, username, password, gender)
    values(
        '${name}',
        '${username}',
        '${hashedPassword}',
        '${gender}'
    );`;

    await db.run(createUser);
    response.status(200);
    response.send("User created successfully");
  }
});

// API-2 login user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserExists = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const userExistsResult = await db.get(checkUserExists);
  if (userExistsResult === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const validatePassword = await bcrypt.compare(
      password,
      userExistsResult.password
    );
    if (validatePassword === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "secretKey");
      response.status(200);
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const latestTweetsQuery = `
  SELECT 
  user.username, tweet.tweet, tweet.date_time
  FROM (follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS latest_tweets
  INNER JOIN user ON tweet.user_id = user.user_id
  ORDER BY tweet.date_time DESC
  LIMIT 4;
  `;
  const latestTweets = await db.all(latestTweetsQuery);
  response.send(
    latestTweets.map((eachTweet) => {
      return {
        username: eachTweet.username,
        tweet: eachTweet.tweet,
        dateTime: eachTweet.date_time,
      };
    })
  );
});

// API-4 Get all following users of a login user
app.get("/user/following/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserId = `
  SELECT user_id
  FROM user
  WHERE username = '${username}';`;
  const { user_id } = await db.get(getUserId);

  const tweetsQuery = `
  SELECT
  name
  FROM follower INNER JOIN user on user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = ${user_id};`;

  const followingUsers = await db.all(tweetsQuery);
  console.log(followingUsers);
  response.send(
    followingUsers.map((eachFollower) => {
      return {
        name: eachFollower.name,
      };
    })
  );
});

// API-5 Get users who follows the logged in user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserId = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';`;

  const userId = await db.get(getUserId);
  const followersListQuery = `
  SELECT *
  FROM user
  INNER JOIN follower ON user.user_id = follower.following_user_id
  WHERE user.username = '${username}';`;

  const followersList = await db.all(followersListQuery);
  const convertedNames = followersList.map((eachFollower) => {
    return {
      name: eachFollower.username,
    };
  });
  console.log(convertedNames);
  response.send(convertedNames);
});

module.exports = app;
