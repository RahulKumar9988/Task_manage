const mongoose = require("mongoose");
require("dotenv").config(); // Load environment variables

const mongo_url = process.env.MONGO_URL; // Read MONGO_URL from .env

if (!mongo_url) {
  console.error("MongoDB URL is undefined. Please check your .env file.");
  process.exit(1); // Exit the application if Mongo URL is undefined
}

mongoose
  .connect(mongo_url)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
