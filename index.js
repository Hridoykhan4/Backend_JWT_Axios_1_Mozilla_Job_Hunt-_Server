const express = require("express");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [`http://localhost:5173`],
    credentials: true, //Enable cookies from React client
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized Access" });
    }
    //
    req.user = decoded;
    console.log(req.user);
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
      res
        .cookie("token", token, {
          secure: false,
          httpOnly: true,
        })
        .send({ success: true });
    });

    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: false,
        })
        .send({ success: true });
    });

    // Job related APIS
    // Get all jobs
    app.get("/jobs", async (req, res) => {
      const { fromFeatured, email, allJobs } = req.query;
      let result;
      if (fromFeatured === "featureTrue") {
        result = await jobCollection.find().limit(4).toArray();
        return res.send(result);
      }

      if (email) {
        result = await jobCollection.find({ hr_email: email }).toArray();
        return res.send(result);
      }

      if (allJobs === "all") {
        result = await jobCollection.find().toArray();
        return res.send(result);
      }
    });

    // Get a specific job
    app.get("/jobs/:id", async (req, res) => {
      const result = await jobCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // Get all applied jobs by all applicants
    app.get("/job-applications/jobs/:job_id", async (req, res) => {
      const result = await jobApplicationCollection
        .find({ job_id: req.params.job_id })
        .toArray();
      res.send(result);
    });

    // Patch a job application
    app.patch("/job-applications/:id", async (req, res) => {
      console.log(req.body);
      const status = req.body;
      const result = await jobApplicationCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: status.status } }
      );

      res.send(result);
    });

    // Get jobs based on email
    app.get("/appliedData", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email };

      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

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
    });

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

      const id = application.job_id;

      const query = { _id: new ObjectId(id) };
      const job = await jobCollection.findOne(query);

      let newCount = 0;

      if (job.applicationCount) {
        newCount = job.applicationCount + 1;
      } else {
        newCount = 1;
      }

      const response = await jobCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            applicationCount: newCount,
          },
        }
      );
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
      if (matchedJob.applicationCount) {
        const reduceCount = {
          $set: {
            applicationCount: matchedJob.applicationCount - 1,
          },
        };

        const result = await jobCollection.updateOne(
          { _id: new ObjectId(jobId) },
          reduceCount
        );
      }

      const result = await jobApplicationCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
