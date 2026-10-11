
"use strict";

(() => {
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const message = document.getElementById("login-message");
  const button = document.getElementById("sign-in-button");
  const togglePassword = document.getElementById("toggle-password");
  const forgotLink = document.getElementById("forgot-link");

  const config = window.DAYONE_CONFIG?.COGNITO;

  function showMessage(text, type = "error") {
    if (!message) return;

    message.textContent = text;
    message.className = "form-message";

    if (text) message.classList.add(type);
  }

  function setLoading(loading) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading ? "Signing in..." : "Sign in →";
  }

  function getPool() {
    if (
      !config ||
      !config.REGION ||
      !config.USER_POOL_ID ||
      !config.CLIENT_ID ||
      config.REGION.startsWith("YOUR_") ||
      config.USER_POOL_ID.startsWith("YOUR_") ||
      config.CLIENT_ID.startsWith("YOUR_")
    ) {
      throw new Error(
        "Configure the Cognito Region, User Pool ID, and App Client ID in js/config.js."
      );
    }

    if (!window.AmazonCognitoIdentity) {
      throw new Error(
        "The Cognito SDK could not load. Check your internet connection."
      );
    }

    return new window.AmazonCognitoIdentity.CognitoUserPool({
      UserPoolId: config.USER_POOL_ID,
      ClientId: config.CLIENT_ID
    });
  }

  function navigateAfterLogin(session, expectedRole) {
    const payload = session.getIdToken().decodePayload();
    const groups = payload["cognito:groups"] || [];

    if (!groups.includes(expectedRole)) {
      showMessage(
        "Access denied. Your account is not assigned to the selected portal."
      );

      // Do not keep a session for a user who selected the wrong portal.
      const pool = getPool();
      pool.getCurrentUser()?.signOut();

      setLoading(false);
      return;
    }

    window.location.replace(
      expectedRole === "HRAdmin"
        ? "admin.html"
        : "onboarding.html"
    );
  }

  function authenticate(expectedRole, password) {
    const pool = getPool();
    const username = emailInput.value.trim();

    const user = new window.AmazonCognitoIdentity.CognitoUser({
      Username: username,
      Pool: pool
    });

    const authDetails =
      new window.AmazonCognitoIdentity.AuthenticationDetails({
        Username: username,
        Password: password
      });

    const callbacks = {
      onSuccess(session) {
        navigateAfterLogin(session, expectedRole);
      },

      onFailure(error) {
        console.error("Cognito sign-in failed:", error);
        showMessage(error.message || "Sign-in failed.");
        setLoading(false);
      },

      newPasswordRequired(userAttributes, requiredAttributes) {
        delete userAttributes.email_verified;
        delete userAttributes.phone_number_verified;

        const newPassword = window.prompt(
          "Your temporary password must be changed. Enter a new password:"
        );

        if (!newPassword) {
          showMessage("Password change cancelled.");
          setLoading(false);
          return;
        }

        if (newPassword.length < 8) {
          showMessage("The new password must be at least 8 characters.");
          setLoading(false);
          return;
        }

        const attributes = {};

        // Cognito may request additional attributes during first sign-in.
        (requiredAttributes || []).forEach(attribute => {
          const value = window.prompt(
            "Enter the required value for " + attribute + ":"
          );

          if (value !== null && value.trim() !== "") {
            attributes[attribute] = value.trim();
          }
        });

        user.completeNewPasswordChallenge(
          newPassword,
          attributes,
          callbacks
        );
      },

      mfaRequired() {
        const code = window.prompt("Enter the MFA verification code:");

        if (!code) {
          showMessage("MFA verification cancelled.");
          setLoading(false);
          return;
        }

        user.sendMFACode(code.trim(), callbacks);
      },

      totpRequired() {
        const code = window.prompt(
          "Enter the code from your authenticator app:"
        );

        if (!code) {
          showMessage("MFA verification cancelled.");
          setLoading(false);
          return;
        }

        user.sendMFACode(
          code.trim(),
          callbacks,
          "SOFTWARE_TOKEN_MFA"
        );
      }
    };

    user.authenticateUser(authDetails, callbacks);
  }

  if (form) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      showMessage("");

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const role = form.querySelector(
        'input[name="login-role"]:checked'
      )?.value;

      if (!email || !password) {
        showMessage("Enter your email and password.");
        return;
      }

      if (!["Candidate", "HRAdmin"].includes(role)) {
        showMessage("Select a valid login portal.");
        return;
      }

      setLoading(true);

      try {
        authenticate(role, password);
      } catch (error) {
        console.error(error);
        showMessage(error.message || "Unable to start sign-in.");
        setLoading(false);
      }
    });
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const hidden = passwordInput.type === "password";
      passwordInput.type = hidden ? "text" : "password";
      togglePassword.textContent = hidden ? "Hide" : "Show";
      togglePassword.setAttribute(
        "aria-label",
        hidden ? "Hide password" : "Show password"
      );
    });
  }

  if (forgotLink) {
    forgotLink.addEventListener("click", event => {
      event.preventDefault();
      showMessage("");

      const email = emailInput.value.trim();

      if (!email) {
        showMessage("Enter your email address first.");
        emailInput.focus();
        return;
      }

      let pool;

      try {
        pool = getPool();
      } catch (error) {
        showMessage(error.message);
        return;
      }

      const user = new window.AmazonCognitoIdentity.CognitoUser({
        Username: email,
        Pool: pool
      });

      setLoading(true);

      user.forgotPassword({
        onSuccess() {
          showMessage(
            "Password reset successful. Sign in with your new password.",
            "success"
          );
          setLoading(false);
        },

        onFailure(error) {
          showMessage(error.message || "Unable to start password reset.");
          setLoading(false);
        },

        inputVerificationCode() {
          const code = window.prompt(
            "Enter the verification code sent to your account:"
          );

          if (!code) {
            showMessage("Password reset cancelled.");
            setLoading(false);
            return;
          }

          const newPassword = window.prompt("Enter your new password:");

          if (!newPassword) {
            showMessage("Password reset cancelled.");
            setLoading(false);
            return;
          }

          user.confirmPassword(code.trim(), newPassword, {
            onSuccess() {
              showMessage(
                "Password reset successful. Sign in with your new password.",
                "success"
              );
              passwordInput.value = "";
              setLoading(false);
            },

            onFailure(error) {
              showMessage(error.message || "Unable to reset password.");
              setLoading(false);
            }
          });
        }
      });
    });
  }


  window.DayOneAuth = {
    getSession() {
      return new Promise((resolve, reject) => {
        try {
          const pool = getPool();
          const user = pool.getCurrentUser();

          if (!user) {
            reject(new Error("Please sign in first."));
            return;
          }

          user.getSession((error, session) => {
            if (error || !session || !session.isValid()) {
              reject(
                new Error(
                  "Your session is invalid. Please sign in again."
                )
              );
              return;
            }

            resolve(session);
          });
        } catch (error) {
          reject(error);
        }
      });
    },

    signOut() {
      try {
        const pool = getPool();
        const user = pool.getCurrentUser();

        if (user) {
          user.signOut();
        }
      } catch (error) {
        console.error("Sign-out failed:", error);
      }

      window.location.replace("index.html");
    }
  };

  document.querySelectorAll(
    "#logout-link, #admin-signout, #signout"
  ).forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.DayOneAuth.signOut();
    });
  });
})();
