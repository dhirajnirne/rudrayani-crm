require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const healthRoutes = require("./routes/health");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api", healthRoutes);

// TODO (Phase 1): auth routes, agency/company/branch/team routes
// TODO (Phase 2): import-template + excel-import routes
// TODO (Phase 3): allocation, calling, disposition, payment routes
// TODO (Phase 4): location-ping ingestion route (Section 9 of the build brief)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Rudrayani CRM backend running on http://localhost:${PORT}`);
});
