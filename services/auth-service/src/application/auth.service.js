const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AppError = require("../domain/app-error");

function createAuthService({ userRepository, jwtSecret }) {
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  async function register(input) {
    const username =
      typeof input.username === "string" ? input.username.trim() : "";
    const email =
      typeof input.email === "string"
        ? input.email.trim().toLowerCase()
        : "";
    const password = input.password;
    const phone =
      typeof input.phone === "string" ? input.phone.trim() : "";

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
      throw new AppError(
        "VALIDATION",
        "Username must contain 3-50 letters, digits or underscores"
      );
    }

    if (
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new AppError("VALIDATION", "Invalid email");
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new AppError(
        "VALIDATION",
        "Password must contain at least 8 characters and at most 72 bytes"
      );
    }

    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) {
      throw new AppError("VALIDATION", "Invalid phone number");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const user = await userRepository.createNormalUser({
        username,
        email,
        phone,
        passwordHash,
      });

      return {
        uid: user.uid,
        message: "User registered successfully",
      };
    } catch (error) {
      if (error.code === "23505") {
        throw new AppError(
          "CONFLICT",
          "Username or email already exists"
        );
      }
      throw error;
    }
  }

  async function login(input) {
    const username =
      typeof input.username === "string" ? input.username.trim() : "";
    const password = input.password;

    if (
      !username ||
      typeof password !== "string" ||
      !password ||
      username.length > 50 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new AppError("VALIDATION", "Invalid username or password input");
    }

    const user = await userRepository.findByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError(
        "UNAUTHENTICATED",
        "Invalid username or password"
      );
    }

    const accessToken = jwt.sign(
      { role: user.rolename },
      jwtSecret,
      {
        algorithm: "HS256",
        subject: String(user.uid),
        issuer: "ecommerce-auth",
        audience: "ecommerce-api",
        expiresIn: 3600,
      }
    );

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
    };
  }

  return { register, login };
}

module.exports = createAuthService;
