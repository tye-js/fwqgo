import { db } from "./index";
import { categories, tags, users } from "./schema";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  try {
    // Create default admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);
    
    await db.insert(users).values({
      id: "admin-user-id",
      username: "admin",
      password: hashedPassword,
      email: "admin@fwqgo.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    // Create default categories
    await db.insert(categories).values([
      {
        name: "云服务器",
        slug: "cloud-server",
        description: "云服务器相关内容",
        keywords: "云服务器,VPS,云主机",
        createdAt: new Date(),
      },
      {
        name: "域名注册",
        slug: "domain-registration", 
        description: "域名注册相关内容",
        keywords: "域名,注册,DNS",
        createdAt: new Date(),
      },
      {
        name: "CDN加速",
        slug: "cdn-acceleration",
        description: "CDN加速相关内容", 
        keywords: "CDN,加速,网络",
        createdAt: new Date(),
      },
    ]).onConflictDoNothing();

    // Create default tags
    await db.insert(tags).values([
      {
        name: "阿里云",
        slug: "aliyun",
        description: "阿里云相关内容",
        keywords: "阿里云,Alibaba Cloud",
        createdAt: new Date(),
      },
      {
        name: "腾讯云", 
        slug: "tencent-cloud",
        description: "腾讯云相关内容",
        keywords: "腾讯云,Tencent Cloud",
        createdAt: new Date(),
      },
      {
        name: "华为云",
        slug: "huawei-cloud", 
        description: "华为云相关内容",
        keywords: "华为云,Huawei Cloud",
        createdAt: new Date(),
      },
    ]).onConflictDoNothing();

    console.log("Database seeded successfully!");

  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log("Seeding finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Seeding failed:", error);
      process.exit(1);
    });
}

export { seed };
