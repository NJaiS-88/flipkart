import mongoose from "mongoose";

const HotspotSchema = new mongoose.Schema({
  cluster_id: Number,
  road_class: String,
});
const Hotspot = mongoose.model("Hotspot", HotspotSchema);

const MONGO_URI = "mongodb+srv://jaisumanthnekkanti_db_user:83ptCXOX8id97u9d@cluster0.3xwgowm.mongodb.net/?appName=Cluster0";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const total = await Hotspot.countDocuments();
  const classes = await Hotspot.distinct("road_class");
  
  console.log(`\nRoad Class Distribution across all ${total} hotspots:`);
  for (const cls of classes) {
    const count = await Hotspot.countDocuments({ road_class: cls });
    console.log(`  - ${cls || "empty"}: ${count} (${((count/total)*100).toFixed(1)}%)`);
  }

  mongoose.connection.close();
}

main().catch(console.error);
