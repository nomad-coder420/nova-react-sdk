#!/usr/bin/env node

// Load environment variables from .env file
try {
  require("dotenv").config();
} catch (error) {
  // dotenv not installed - that's ok, will use system env vars
}

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

class NovaSync {
  constructor() {
    this.config = this.loadConfig();
    this.objects = {};
    this.experiences = {};
    this.errors = [];
  }

  // Load configuration from multiple sources
  loadConfig() {
    const config = {
      orgId: null,
      appId: null,
      apiKey: null,
      apiEndpoint: "https://api.nova.com",
    };

    // 1. Try environment variables
    config.orgId = process.env.NOVA_ORG_ID;
    config.appId = process.env.NOVA_APP_ID;
    config.apiKey = process.env.NOVA_API_KEY;
    config.apiEndpoint = process.env.NOVA_API_ENDPOINT || config.apiEndpoint;

    // 2. Try .novarc file
    try {
      const rcFile = path.join(process.cwd(), ".novarc");
      if (fs.existsSync(rcFile)) {
        const rcConfig = JSON.parse(fs.readFileSync(rcFile, "utf8"));
        Object.assign(config, rcConfig);
      }
    } catch (error) {
      // Ignore rc file errors
    }

    // 3. Try package.json nova config
    try {
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      if (packageJson.nova) {
        Object.assign(config, packageJson.nova);
      }
    } catch (error) {
      // Ignore package.json errors
    }

    return config;
  }

  // Check if this is a Nova project
  validateProject() {
    if (!fs.existsSync("package.json")) {
      throw new Error(
        "No package.json found. Run this command from your project root."
      );
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      const hasNova =
        packageJson.dependencies?.["nova-react-sdk"] ||
        packageJson.devDependencies?.["nova-react-sdk"];

      if (!hasNova) {
        throw new Error(
          "nova-react-sdk not found in dependencies. Install it first:\n  npm install nova-react-sdk"
        );
      }
    } catch (error) {
      if (error.message.includes("nova-react-sdk")) throw error;
      throw new Error("Invalid package.json file");
    }

    // Validate required config
    if (!this.config.orgId || !this.config.appId || !this.config.apiKey) {
      const missing = [];
      if (!this.config.orgId) missing.push("NOVA_ORG_ID");
      if (!this.config.appId) missing.push("NOVA_APP_ID");
      if (!this.config.apiKey) missing.push("NOVA_API_KEY");

      throw new Error(`Missing required configuration: ${missing.join(", ")}`);
    }
  }

  // Load objects from nova-objects.json
  loadObjectsFromJson() {
    console.log("📄 Loading objects from nova-objects.json...");

    const jsonPath = path.join(process.cwd(), "src", "nova-objects.json");

    if (!fs.existsSync(jsonPath)) {
      throw new Error(
        "nova-objects.json not found. Create this file with your object definitions."
      );
    }

    try {
      const jsonContent = fs.readFileSync(jsonPath, "utf8");
      const data = JSON.parse(jsonContent);

      if (!data.objects || typeof data.objects !== "object") {
        throw new Error(
          'nova-objects.json must have an "objects" property with object definitions'
        );
      }

      if (!data.experiences || typeof data.experiences !== "object") {
        throw new Error(
          'nova-objects.json must have an "experiences" property with experience definitions'
        );
      }

      this.objects = data.objects;
      this.experiences = data.experiences;
      console.log(`✅ Found ${Object.keys(this.objects).length} objects`);

      return this.objects;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in nova-objects.json: ${error.message}`);
      }
      throw error;
    }
  }

  // Save registry to file
  saveRegistryFile() {
    const registryData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        orgId: this.config.orgId,
        appId: this.config.appId,
        version: this.getPackageVersion(),
        totalObjects: Object.keys(this.objects).length,
      },
      objects: this.objects,
      errors: this.errors,
    };

    fs.writeFileSync(
      "nova-registry.json",
      JSON.stringify(registryData, null, 2)
    );
    console.log(`📄 Registry saved to "nova-registry.json"`);
    return registryData;
  }

  // Get package version
  getPackageVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      return packageJson.version || "1.0.0";
    } catch {
      return "1.0.0";
    }
  }

  // Sync to backend
  async sync() {
    console.log("🚀 Syncing to Nova backend...");

    const payload = {
      organisation_id: this.config.orgId,
      app_id: this.config.appId,
      objects: this.objects,
      experiences: this.experiences,
    };

    const response = await fetch(
      `${this.config.apiEndpoint}/api/v1/feature-flags/sync-nova-objects/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sync failed: ${error}`);
    }

    const result = await response.json();
    console.log("✅ Sync successful!");

    return result;
  }

  // Main execution
  async run() {
    try {
      console.log("🎯 Nova Registry Sync");

      this.validateProject();
      this.loadObjectsFromJson();

      if (Object.keys(this.objects).length === 0) {
        console.log("⚠️  No objects found in nova-objects.json");
        return;
      }

      this.saveRegistryFile();

      await this.sync();
      console.log("🎉 Complete!");
    } catch (error) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  }
}

// CLI argument handling
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isVerbose = args.includes("--verbose");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Nova Registry Sync

Usage:
  npx nova-sync              Sync objects from nova-objects.json to dashboard
  npx nova-sync --help       Show this help

Required:
  nova-objects.json          File with your object definitions

Configuration (optional):
  Environment variables:
    NOVA_ORG_ID=your-org-id
    NOVA_APP_ID=your-app-id  
    NOVA_API_KEY=your-api-key

Example nova-objects.json:
  {
    "objects": {
      "welcome-button": {
        "text": "Welcome!",
        "color": "blue"
      },
      "game-settings": {
        "difficulty": "medium",
        "coins": 100
      }
    }
  }
`);
  process.exit(0);
}

// Run the sync
const sync = new NovaSync();
sync.run();
