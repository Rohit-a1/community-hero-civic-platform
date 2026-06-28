# Security Specification for Community Hero (Civic Reports)

This specification defines the security rules and data invariants for the Civic Reports collection (`/reports/{reportId}`) in Firestore.

## 1. Data Invariants
1. **Authenticated Creator**: A report can only be created by an authenticated user.
2. **Identity Integrity**: The `userId` of the submitted report must exactly match the authenticated user's UID (`request.auth.uid`).
3. **Immutable Creator & Content**: Once a report is created, its `userId`, `photoUrl`, `gps`, `landmark`, `category`, and `timestamp` cannot be modified by any user.
4. **Valid Initial Status**: When created, the report status must be set to `"Reported"`.
5. **Server Timestamps**: The `timestamp` field must be set exactly to the server's request time (`request.time`).
6. **No Deletion**: Citizens are not allowed to delete reports once submitted to preserve civic accountability.

## 2. The "Dirty Dozen" Payloads (Permission Denied Cases)
These payloads must be rejected by the security rules:

1. **Anonymous Submission**: Create a report without any user credentials (no auth).
2. **Identity Spoofing**: Submit a report with `userId: "user_abc"` while authenticated as `userId: "user_xyz"`.
3. **Invalid Initial Status**: Submit a report with `status: "Resolved"` or `status: "In Progress"` upon creation.
4. **Future Timestamp**: Submit a report with `timestamp` set to a future date instead of `request.time`.
5. **Past Timestamp**: Submit a report with `timestamp` set to an old date instead of `request.time`.
6. **Malformed GPS Coordinates**: Submit a report with missing `latitude` or `longitude` inside the `gps` field.
7. **Junk Landmark Name**: Submit a report with an excessively long landmark name (>500 characters).
8. **Invalid Issue Category**: Submit a report with a category not in the civic issue set (e.g. `category: "Spam"`).
9. **Junk Report ID**: Submit a report using a malformed document ID with special characters that bypass normal limits.
10. **Unauthorized Status Modification**: An authenticated user attempting to change their own report's status to `"Resolved"`.
11. **Malicious Content Editing**: An authenticated user attempting to modify another citizen's report's GPS or Photo URL.
12. **Malicious Report Deletion**: A user attempting to delete a civic report.

## 3. Security Rules
The rules in `firestore.rules` will enforce these constraints using robust validation helpers.
