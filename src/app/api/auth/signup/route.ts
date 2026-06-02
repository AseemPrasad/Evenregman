import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db";
import { UserModel } from "@/models/User";

const hostSignupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8)
});

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = hostSignupSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid signup data", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const existingUser = await UserModel.findOne({ email: parsed.data.email }).lean();

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const createdUser = await UserModel.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: "HOST"
    });

    return NextResponse.json(
      {
        user: {
          id: createdUser._id.toString(),
          name: createdUser.name,
          email: createdUser.email,
          role: createdUser.role
        }
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unable to create host account" }, { status: 500 });
  }
}
