const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const path = require("path");

const uri = `${process.env.MONGO_URI}`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

app.use(cors());
app.use(express.json());

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const productsCollection = client
      .db("gadgetsDestination")
      .collection("products");
    const usersCollection = client.db("gadgetsDestination").collection("users");
    const orderCollection = client
      .db("gadgetsDestination")
      .collection("orders");
    const paymentCollection = client
      .db("gadgetsDestination")
      .collection("payments");
    const reviewsCollection = client
      .db("gadgetsDestination")
      .collection("reviews");
    const addToCartCollection = client
      .db("gadgetsDestination")
      .collection("carts");
    const teamsCollection = client.db("gadgetsDestination").collection("teams");
    const teamMembersCollection = client
      .db("gadgetsDestination")
      .collection("teamMembers");
    const blogsCollection = client.db("gadgetsDestination").collection("blogs");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    /*
          Payment Routes Starts
    */
    app.post("/payment/create-payment-intent", verifyJWT, async (req, res) => {
      const data = req.body;
      const price = data.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/booking", verifyJWT, async (req, res) => {
      const id = req.query.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    app.get("/payment/history", verifyJWT, async (req, res) => {
      const uid = req.query.uid;
      if (uid) {
        const payment = await paymentCollection.find({ uid: uid }).toArray();
        res.send(payment);
      } else {
        res.status(403).send({ message: "forbidden access" });
      }
    });

    app.patch("/orders/paid/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: body,
      };
      const updatedBooking = await orderCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(updatedBooking);
    });

    app.patch("/orders/shipped/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: body,
      };
      const updatedBooking = await orderCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedBooking);
    });
    /*
          Payment Routes Ends
    */

    /*
          User Routes Starts
    */

    app.get("/users", async (req, res) => {
      const uid = req.query.uid;
      if (uid) {
        const users = await usersCollection.find({ uid: uid }).toArray();
        res.send(users);
      } else {
        res.status(403).send({ message: "forbidden access" });
      }
    });

    app.get("/users/all", verifyJWT, async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    // update user data using patch
    app.patch("/users", verifyJWT, async (req, res) => {
      const data = req.body;
      const uid = req.query.uid;
      const decodedID = req.decoded.uid;
      const query = { uid: uid };
      const updateDoc = {
        $set: data,
      };
      if (decodedID === uid) {
        const result = await usersCollection.updateOne(query, updateDoc);
        if (result.acknowledged) {
          res.send({ success: true, message: "Update profile successfully" });
        }
      } else {
        res.status(403).send({ success: false, message: "Forbidden request" });
      }
    });

    app.put("/user", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email, uid: user.uid };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign(
        { email: user.email, uid: user.uid },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "7d" }
      );
      res.send({ result, token });
    });

    app.delete("/user/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.deleteOne({ email: email });
      res.send(result);
    });

    /*
          User Routes End
    */
    // -----------------------------
    /*
          Admin Routes Starts
    */

    // -----------------------------
    /*
          Order Routes Starts
    */
    //get only my orders with uid
    app.get("/orders", verifyJWT, async (req, res) => {
      const uid = req.query.uid;
      const decodedID = req.decoded.uid;
      const query = { uid: uid };
      if (decodedID === uid) {
        const myOrders = await orderCollection.find(query).toArray();
        return res.send(myOrders);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    });

    // get all orders
    app.get("/orders/all", verifyJWT, verifyAdmin, async (req, res) => {
      const orders = await orderCollection.find({}).toArray();
      res.send(orders);
    });

    // post order to database with stop duplicates
    app.post("/orders", verifyJWT, async (req, res) => {
      const order = req.body;
      const exists = await orderCollection.findOne({
        uid: order.uid,
        id: order.productInfo.id,
      });
      if (exists) {
        return res.send({ success: false, order: exists });
      } else {
        const result = await orderCollection.insertOne(order);
        res.send({ success: true, order: result });
      }
    });

    // delete a order
    app.delete("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await orderCollection.deleteOne({ _id: ObjectId(id) });
      res.send(result);
    });
    /*
          Order Routes Ends
    */

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user?.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.put("/user/admin/", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.body.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.put("/user/removeAdmin/", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.body.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "user" },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    /*
          Admin Routes End
    */

    // -----------------------------

    /*
          Product Routes Starts
    */

    app.get("/products", async (req, res) => {
      let sort;
      if (req.query.sort) {
        sort = { _id: -1 };
      }
      const parts = await productsCollection.find({}).sort(sort).toArray();
      res.send(parts);
    });

    app.get("/products/all", async (req, res) => {
      const result = await productsCollection.find({}).toArray();
      res.send({ success: true, result: result });
    });

    app.get("/products/search", async (req, res) => {
      const searchText = req.query.q.toLowerCase();
      const result = await productsCollection.find({}).toArray();
      const searchedResult = result.filter((product) =>
        product.productName.toLowerCase().includes(searchText)
      );
      res.send(searchedResult);
    });

    app.post("/products", async (req, res) => {
      const parts = req.body;
      const result = await productsCollection.insertOne(parts);
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const parts = await productsCollection.findOne({
        _id: ObjectId(req.params.id),
      });
      res.send(parts);
    });

    // delete parts with uid
    app.delete("/products/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.deleteOne({
        _id: ObjectId(id),
      });
      res.send(result);
    });

    // update parts with uid
    app.patch("/products/update-stock/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: body,
      };
      const updatedBooking = await productsCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(updatedBooking);
    });

    app.put("/products/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const query = {
        email: req.body.email,
        title: req.body.title,
      };
      const exists = await productsCollection.findOne(query);
      const result = await productsCollection.updateOne(
        { _id: ObjectId(id) },
        { $set: body },
        { upsert: true }
      );
      if (exists) {
        return res.send({ success: false, order: exists });
      } else {
        res.send({ success: true, order: result });
      }
    });

    app.patch("/products/updateQty/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: body,
      };
      const updatedBooking = await productsCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(updatedBooking);
    });

    app.get("/carts", async (req, res) => {
      const uid = req.query.uid;
      const decodedID = req.decoded.uid;
      const query = { uid: uid };
      if (decodedID === uid) {
        const myOrders = await addToCartCollection.find(query).toArray();
        return res.send(myOrders);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    });

    app.post("/carts", verifyJWT, async (req, res) => {
      const cart = req.body;
      const exists = await addToCartCollection.findOne({
        uid: cart.uid,
        id: cart.productInfo.id,
      });
      if (exists) {
        return res.send({ success: false, order: exists });
      } else {
        const result = await addToCartCollection.insertOne(cart);
        res.send({ success: true, order: result });
      }
    });

    app.delete("/carts/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await addToCartCollection.deleteOne({
        _id: ObjectId(id),
      });
      res.send(result);
    });

    /*
          Product Routes Ends
    */

    /*
          Teams Routes Starts
    */

    app.get("/teams", async (req, res) => {
      const teams = await teamsCollection.find({}).toArray();
      res.send(teams);
    });

    /*
          Teams Routes Ends
    */

    /*
          Reviews Routes Starts
    */
    // get reviews
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewsCollection.find({}).toArray();
      res.send(reviews);
    });

    // post review with uid params
    app.post("/reviews", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.delete("/reviews/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({
        _id: ObjectId(id),
      });
      res.send(result);
    });
    /*
          Reviews Routes Ends
    */

    /*
          Team Member Routes Starts
    */

    app.get("/teamMembers", async (req, res) => {
      const teamMembers = await teamMembersCollection.find({}).toArray();
      res.send(teamMembers);
    });

    // get member with id
    app.get("/teamMembers/:id", async (req, res) => {
      const id = req.params.id;
      const membersDet = await teamMembersCollection.findOne({
        _id: ObjectId(id),
      });
      res.send(membersDet);
    });

    app.post("/teamMembers", verifyJWT, async (req, res) => {
      const teamMember = req.body;
      const result = await teamMembersCollection.insertOne(teamMember);
      res.send(result);
    });

    app.delete("/teamMembers/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const result = await teamMembersCollection.deleteOne({
        _id: ObjectId(id),
      });
      res.send(result);
    });

    /*
          Team Member Routes Ends
    */

    /*
          Blogs Routes Starts
    */
    app.get("/blogs/all", async (req, res) => {
      const blogs = await blogsCollection.find({}).toArray();
      res.send(blogs);
    });

    app.get("/blogs", async (req, res) => {
      const userId = req.query.uid;
      const query = { "author.uid": userId };
      const result = await blogsCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/blogs", verifyJWT, async (req, res) => {
      const userId = req.query.uid;
      const decodedID = req.decoded.uid;
      const id = req.query.editId;
      const data = req.body;
      if (userId === decodedID) {
        const options = { upsert: true };
        const query = { _id: ObjectId(id) };
        const updateDoc = {
          $set: data,
        };
        const result = await blogsCollection.updateOne(
          query,
          updateDoc,
          options
        );
        if (result.acknowledged) {
          res.send({
            success: true,
            message: "Updated blog successfully done.",
          });
        }
      } else {
        res.status(403).send({ success: false, message: "forbidden request" });
      }
    });

    app.delete("/blogs", verifyJWT, async (req, res) => {
      const userId = req.query.uid;
      const deleteId = req.query.deletedId;
      const decodedID = req.decoded.uid;
      if (userId === decodedID) {
        const query = { _id: ObjectId(deleteId) };
        const result = await blogsCollection.deleteOne(query);
        if (result.acknowledged) {
          res.send({
            success: true,
            message: "Blog deleted successfully done.",
          });
        }
      } else {
        res.status(403).send({ success: false, message: "forbidden request" });
      }
    });

    app.get("/blogs/search", async (req, res) => {
      const searchText = req.query.q.toLowerCase();
      const result = await blogsCollection.find({}).toArray();
      const searchedResult = result.filter((blogs) =>
        blogs.title.toLowerCase().includes(searchText)
      );
      res.send(searchedResult);
    });

    app.get("/blogs/:id", async (req, res) => {
      const id = req.params.id;
      const blog = await blogsCollection.findOne({ _id: ObjectId(id) });
      res.send(blog);
    });

    app.post("/blogs", verifyJWT, async (req, res) => {
      const blog = req.body;
      const result = await blogsCollection.insertOne(blog);
      res.send(result);
    });
    /*
          Blogs Routes Ends
    */
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./index.html"));
});

app.listen(port, () => {
  console.log(`Gadgets Destination app listening on port ${port}`);
});
