const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Configuration
const CONFIG = {
  // These should come from environment variables
  NOVA_API_ENDPOINT: process.env.NOVA_API_ENDPOINT || "https://api.nova.com",
  NOVA_ORG_ID: process.env.NOVA_ORG_ID,
  NOVA_APP_ID: process.env.NOVA_APP_ID,
  NOVA_API_KEY: process.env.NOVA_API_KEY,

  // File paths to scan for registerNovaObject calls
  SOURCE_DIRS: ["src"],
  REGISTRY_FILE: "nova-registry.json",
};

class NovaRegistrySync {
  constructor() {
    this.registry = [];
    this.errors = [];
  }

  // Scan source files for registerNovaObject calls
  async scanSourceFiles() {
    console.log("🔍 Scanning source files for Nova objects...");

    for (const dir of CONFIG.SOURCE_DIRS) {
      if (fs.existsSync(dir)) {
        await this.scanDirectory(dir);
      }
    }

    console.log(`✅ Found ${this.registry.length} Nova objects`);
    return this.registry;
  }

  // Recursively scan directory
  async scanDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await this.scanDirectory(fullPath);
      } else if (entry.isFile() && this.isSourceFile(entry.name)) {
        await this.scanFile(fullPath);
      }
    }
  }

  // Check if file should be scanned
  isSourceFile(filename) {
    const extensions = [".js", ".jsx", ".ts", ".tsx"];
    return extensions.some((ext) => filename.endsWith(ext));
  }

  // Scan individual file for registerNovaObject calls
  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const objects = this.extractNovaObjects(content, filePath);
      this.registry.push(...objects);
    } catch (error) {
      this.errors.push(`Error scanning ${filePath}: ${error.message}`);
    }
  }

  // Extract Nova objects from file content using regex
  extractNovaObjects(content, filePath) {
    const objects = [];

    // Pattern 1: Direct registerNovaObject calls
    // registerNovaObject({ name: 'button', defaultProps: { ... } })
    const directPattern =
      /registerNovaObject\s*\(\s*\{[\s\S]*?name\s*:\s*['"`]([^'"`]+)['"`][\s\S]*?defaultProps\s*:\s*(\{[\s\S]*?\})\s*(?:as\s+\w+)?\s*\}\s*\)/g;

    let match;
    while ((match = directPattern.exec(content)) !== null) {
      try {
        const name = match[1];
        const defaultPropsStr = match[2];

        // Try to parse the defaultProps object (simplified parsing)
        const defaultProps = this.parseObjectLiteral(defaultPropsStr);

        objects.push({
          name,
          defaultProps,
          sourceFile: filePath,
          pattern: "direct",
        });
      } catch (error) {
        this.errors.push(
          `Error parsing object in ${filePath}: ${error.message}`
        );
      }
    }

    // // Pattern 2: defineNovaObject calls
    // // const BUTTON = defineNovaObject('button', { ... })
    // const definePattern =
    //   /defineNovaObject\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\{[\s\S]*?\})\s*(?:as\s+\w+)?\s*\)/g;

    // while ((match = definePattern.exec(content)) !== null) {
    //   try {
    //     const name = match[1];
    //     const defaultPropsStr = match[2];
    //     const defaultProps = this.parseObjectLiteral(defaultPropsStr);

    //     objects.push({
    //       name,
    //       defaultProps,
    //       sourceFile: filePath,
    //       pattern: "define",
    //     });
    //   } catch (error) {
    //     this.errors.push(
    //       `Error parsing defineNovaObject in ${filePath}: ${error.message}`
    //     );
    //   }
    // }

    return objects;
  }

  // Simple object literal parser (handles basic cases)
  parseObjectLiteral(objStr) {
    try {
      // Remove comments and clean up
      const cleaned = objStr
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove /* */ comments
        .replace(/\/\/.*$/gm, "") // Remove // comments
        .replace(/,\s*}/g, "}") // Remove trailing commas
        .replace(/,\s*]/g, "]"); // Remove trailing commas in arrays

      // Try to parse as JSON (won't work for complex JS expressions)
      return JSON.parse(cleaned.replace(/'/g, '"'));
    } catch (error) {
      // For complex objects, return a placeholder
      return {
        _note: "Complex object - check source file",
        _error: error.message,
      };
    }
  }

  // Save registry to file
  saveRegistryFile() {
    const registryData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        orgId: CONFIG.NOVA_ORG_ID,
        appId: CONFIG.NOVA_APP_ID,
        version: this.getPackageVersion(),
        totalObjects: this.registry.length,
      },
      objects: this.registry,
      errors: this.errors,
    };

    fs.writeFileSync(
      CONFIG.REGISTRY_FILE,
      JSON.stringify(registryData, null, 2)
    );
    console.log(`📄 Registry saved to ${CONFIG.REGISTRY_FILE}`);
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

  // Sync registry to Nova backend
  async syncToBackend(registryData) {
    if (!CONFIG.NOVA_API_KEY) {
      throw new Error("NOVA_API_KEY environment variable is required");
    }

    if (!CONFIG.NOVA_ORG_ID || !CONFIG.NOVA_APP_ID) {
      throw new Error(
        "NOVA_ORG_ID and NOVA_APP_ID environment variables are required"
      );
    }

    console.log("🚀 Syncing registry to Nova backend...");

    const payload = {
      organisationId: CONFIG.NOVA_ORG_ID,
      appId: CONFIG.NOVA_APP_ID,
      metadata: registryData.metadata,
      objects: registryData.objects.map((obj) => ({
        name: obj.name,
        defaultProps: obj.defaultProps,
        sourceFile: obj.sourceFile,
        lastUpdated: new Date().toISOString(),
      })),
    };

    try {
      const response = await fetch(
        `${CONFIG.NOVA_API_ENDPOINT}/api/apps/sync-registry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CONFIG.NOVA_API_KEY}`,
            "X-Nova-Version": "1.0.0",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Registry synced successfully");
      console.log(`   - Objects updated: ${result.objectsUpdated || 0}`);
      console.log(`   - Objects created: ${result.objectsCreated || 0}`);
      console.log(`   - Dashboard URL: ${result.dashboardUrl || "N/A"}`);

      return result;
    } catch (error) {
      console.error("❌ Failed to sync registry:", error.message);
      throw error;
    }
  }

  // Main execution method
  async run() {
    try {
      console.log("🎯 Starting Nova Registry Sync...");

      // 1. Scan source files
      await this.scanSourceFiles();

      if (this.registry.length === 0) {
        console.log(
          "⚠️  No Nova objects found. Make sure you have registerNovaObject or defineNovaObject calls in your code."
        );
        return;
      }

      // 2. Save registry file
      const registryData = this.saveRegistryFile();

      // 3. Sync to backend
      await this.syncToBackend(registryData);

      // 4. Report errors if any
      if (this.errors.length > 0) {
        console.log("\n ⚠️  Warnings during scan:");
        this.errors.forEach((error) => console.log(`   ${error}`));
      }

      console.log("\n🎉 Nova Registry Sync completed successfully!");
    } catch (error) {
      console.error("\n💥 Nova Registry Sync failed:", error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const sync = new NovaRegistrySync();
  sync.run();
}

module.exports = NovaRegistrySync;
