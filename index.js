require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
// Middleware
app.use(
  cors({
    origin: [
      `https://mozilla-job-hunter.web.app`,
      `https://mozilla-job-hunter.firebaseapp.com`,
      `http://localhost:5173`,
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Admin

var admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

var serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

/* const tokenVerify = (token) => {
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (err) {
    return null;
  }
};
 */
const verifyFirebaseToken = async (req, res, next) => {
  const token = req?.headers?.authorization.split(" ")[1];
  if (!token || !req?.headers?.authorization.startsWith("Bearer "))
    return res.status(401).send({ message: "Unauthorized access" });
  const userInfo = await admin.auth().verifyIdToken(token);
  req.tokenEmail = userInfo?.email;
  next();
};

const verifyTokenEmail = (req, res, next) => {
  if (req.tokenEmail !== req.query?.email) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized Access" });
    }
    req.user = decoded;
    next();
  });
};

// Mongo

const uri = `mongodb+srv://${process.env.DB_USER_JOB}:${process.env.DB_USER_PASS}@cluster0.n0qsrr5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const jobCollection = client.db("job-portal").collection("jobs");
    const jobApplicationCollection = client
      .db("job-portal")
      .collection("job_application");

    // Auth Related APIs

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5d",
      });
      res.cookie("token", token, cookieOptions).send({ success: true });
    });

    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });

    // Job related APIS
    app.get("/jobs", async (req, res) => {
      const { fromFeatured, sort, search, minSalary, maxSalary } = req?.query;
      let query = {};

      if (search) {
        query.title = { $regex: search, $options: "i" };
      }

      /*  if (email) {
        const decoded = tokenVerify(req.cookies?.token);
        if (decoded?.email !== email) {
          res.status(403).send({ message: "Forbidden Access" });
        }
        query.hr_email = email;
      }
 */
      if (minSalary || maxSalary) {
        if (minSalary) {
          query["salaryRange.min"] = { $gte: parseInt(minSalary) };
        }
        if (maxSalary) {
          query["salaryRange.max"] = { $lte: parseInt(maxSalary) };
        }
      }

      let cursor = jobCollection.find(query);

      if (fromFeatured === "featureTrue") {
        cursor = cursor.limit(4);
      }

      if (sort === "true") {
        cursor = cursor.sort({ "salaryRange.min": -1 });
      }

      const result = await cursor.toArray();

      res.send(result);
    });

    app.get(
      "/jobs/applicationsCount",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const jobs = await jobCollection
          .find({ hr_email: req.query.email })
          .toArray();

        // console.log(req.tokenEmail,req.query?.email );

        for (const job of jobs) {
          const totalCount = await jobApplicationCollection.countDocuments({
            job_id: job._id.toString(),
          });
          // job.totalCount = totalCount;
          await jobCollection.updateOne(
            { _id: new ObjectId(job._id) },
            { $set: { totalCount } }
          );
        }

        res.send(jobs);
      }
    );

    // Get a specific job
    app.get("/jobs/:id", async (req, res) => {
      const result = await jobCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // Get all applied jobs by all applicants for a single job
    app.get("/job-applications/jobs/:job_id", async (req, res) => {
      const result = await jobApplicationCollection
        .find({ job_id: req.params.job_id })
        .toArray();
      res.send(result);
    });

    // Patch a job application
    app.patch("/job-applications/:id", async (req, res) => {
      const status = req.body;
      const result = await jobApplicationCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: status.status } }
      );

      res.send(result);
    });

    // Get jobs based on email
    app.get(
      "/appliedData",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;
        const query = { email };
        // console.log(req?.tokenEmail, email);
        if (req?.tokenEmail !== email)
          return res.status(403).send({ message: "Forbidden Access" });

        // console.log(email);
        // Will Uncomment soon
        // if (req.user.email !== email) {
        //   return res.status(403).send({ message: "Forbidden Access" });
        // }
        const result = await jobApplicationCollection.find(query).toArray();
        for (const application of result) {
          const jobMatchedInfo = await jobCollection.findOne({
            _id: new ObjectId(application.job_id),
          });
          if (jobMatchedInfo) {
            application.title = jobMatchedInfo.title;
            application.company = jobMatchedInfo.company;
            application.company_logo = jobMatchedInfo.company_logo;
            application.location = jobMatchedInfo.location;
          }
        }
        res.send(result);
      }
    );

    // Post a job
    app.post("/jobs", async (req, res) => {
      const result = await jobCollection.insertOne(req.body);
      res.send(result);
    });

    /* Job Application APIs */
    // Post a job application
    app.post("/job-applications", async (req, res) => {
      const application = req.body;
      const result = await jobApplicationCollection.insertOne(application);

      // Not the best way(Use aggregate)

      // Jokhon apply korbo tokhon count barabo;new system e jkhn Jobs er API te hit korbo,for a jobs posted by particular email e tkhn email query diye job gula load korbo,then loop chalabo and appsCollection e (looped) job er id diye khuje countDocument diye count korbo and job er shathe job?.count diye lagai client e pathai dibo korbo;
      /* 
      const id = application.job_id;

      const query = { _id: new ObjectId(id) };
      const job = await jobCollection.findOne(query);

      let newCount = 0;

      if (job.applicationCount) {
        newCount = job.applicationCount + 1;
      } else {
        newCount = 1;
      }

   await jobCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            applicationCount: newCount,
          },
        }
      ); */
      res.send(result);
    });

    // Check Job in Job Application
    app.get("/applications/check", async (req, res) => {
      const { id, email } = req.query;
      const exists = await jobApplicationCollection.findOne({
        email,
        job_id: id,
      });
      res.send({ exists: !!exists });
    });

    // Remove a applied job from collection
    app.delete("/job-application/:id", async (req, res) => {
      const { jobId } = req.body;
      const matchedJob = await jobCollection.findOne({
        _id: new ObjectId(jobId),
      });
      if (matchedJob?.totalCount) {
        await jobCollection.updateOne(
          { _id: new ObjectId(jobId) },
          { $inc: { totalCount: -1 } }
        );
      }

      const result = await jobApplicationCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
