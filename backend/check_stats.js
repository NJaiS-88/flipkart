import mongoose from "mongoose";

const HotspotSchema = new mongoose.Schema({
  cluster_id: Number,
  road_class: String,
});
const Hotspot = mongoose.model("Hotspot", HotspotSchema);

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parking_db";

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
