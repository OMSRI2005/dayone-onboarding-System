
"use strict";

window.DAYONE_CONFIG = Object.freeze({
  COGNITO: Object.freeze({
    REGION: "us-east-1",
    USER_POOL_ID: "us-east-1_pnzNUzxcn",
    CLIENT_ID: "47su4dm2mtgkqdnqda3f4mq7o3"
  }),

  API: Object.freeze({
    EMPLOYEES_URL:
      "https://g1lrk66pv4.execute-api.us-east-1.amazonaws.com/employees",

    PROGRESS_URL:
      "https://sf960b0131.execute-api.us-east-1.amazonaws.com/progress",

    POLICIES_URL:
      "https://sf960b0131.execute-api.us-east-1.amazonaws.com/policies",

    // Add the deployed CreateDocumentUploadUrl API Gateway URL
    // after Preethi provides and confirms it.
    DOCUMENT_UPLOAD_URL: ""
  }),

  // Maximum document size: 5 MB
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,

  // Accepted document formats: PDF, JPG/JPEG, PNG
  ALLOWED_FILE_TYPES: [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ]
});
