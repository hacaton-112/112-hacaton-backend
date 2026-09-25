import { NestFactory } from "@nestjs/core";

import { CoreModule } from "@/core/core.module";
import { AuthService } from "@/modules/auth/application/auth.service";
import { CreateUserSchema } from "@/modules/auth/dto/create-user.dto";

/**
 * Administrator tool for provisioning accounts — the API has no public sign-up.
 *
 *   bun run user:create -- <email> <password> "<full name>" [role]
 */
async function main(): Promise<void> {
  const [email, password, fullName, role] = process.argv.slice(2);

  const input = CreateUserSchema.parse({
    email,
    password,
    fullName,
    ...(role ? { role } : {}),
  });

  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });

  try {
    const user = await app.get(AuthService).createUser(input);
    console.log(`Created ${user.role} ${user.email} (${user.id})`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
