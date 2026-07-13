**Excredite Power Data Hub**

Functional & Technical Specification - Requested Updates

**Profile & Settings**

• Password change flow must require confirmation of the current password before a new password is accepted, and must require the new password to be entered twice (confirm-password field) to prevent typo-induced lockouts.• **Account Settings dashboard:**◦ **Standard users:**▪ Users can change their own password (subject to the confirmation flow above).▪ Users can view their own activity log (read-only, scoped to their own account).▪ Remove the “Joined” (account creation date) field from session/account info displayed to standard users; restrict visibility of this field to Admin roles only.◦ **Admin users - in addition to standard-user permissions, Admins can:**▪ Reset another user's password (triggers a forced password reset on next login; does not expose the plaintext password to the Admin).▪ Force logout of another user (terminates all active sessions for that account).▪ Edit the anomaly detection threshold used by the Anomaly Alerts engine.▪ View the activity log of all users on the platform.▪ Deactivate a user account (revokes login access without deleting account data).▪ Reactivate a previously deactivated user account.▪ Assign or revoke individual users' access to specific documents.

Implementation note: role-based access control (RBAC) should be enforced at the API layer, not onlyhidden in the UI, so that Admin-only actions via direct API calls cannot be invoked by a standard user.

**Documents**

• Document Type field: extend the existing dropdown/selector to include an “Other” option; selecting it reveals a free-text input where the user manually specifies the document's nature. This value should be stored and made searchable/filterable like the predefined types.• File upload system must support the following formats: PDF, Microsoft Word (.doc/.docx), Microsoft Excel (.xls/.xlsx), and Microsoft PowerPoint (.ppt/.pptx). File type and size should be validated client-side and re-validated server-side before storage.• **Upload sequence UI/UX:**◦ Display a persistent “Uploading…” status indicator (e.g., progress bar or spinner) for the duration of the upload.◦ On completion, replace the indicator with an “Upload successful” confirmation message; on failure, display a clear error state with a retry option.• File sharing: the system should allow authorized users to share a document via email (generates a secure, access-controlled link or attaches the file) and via social media channels (generates a shareable link, subject to the document's assigned access permissions - see Profile & Settings above).

Implementation note: shared links should respect the document's existing access-control list rather than granting open access, particularly given the confidentiality of regulatory/legal documents on this platform_._

**UI Features**

• Sidebar navigation should be collapsible/expandable, allowing the user to show or hide the sidebar to reveal or hide the underlying system features and tools (i.e., a toggle control, persisting the user's preferred state across sessions where possible).• Increase the size of the company logo in the sidebar header for improved brand visibility.• Rename the platform from “Power Data Hub” to “Electricity Data Hub” across all UI labels, page titles, and references.

**Merge “Briefing Notes” into “Documents”**

• Consolidate the “Briefing Notes” section into the “Documents” section as a single unified area; all existing Documents functionality (upload, type classification, sharing, access control, etc.) is retained.• The merged Documents section should support both manual editing (direct user edits within the platform) and AI-assisted editing (AI-generated edits or suggestions applied to a document) of uploaded or generated documents.• When a document is edited, provide the user the option to save the edit as a new copy (preserving the original, unedited version) or to replace/overwrite the original document.• Include a dedicated panel within the Documents section for receiving and displaying documents generated as output from an AI Query Interface query (e.g., an AI-generated briefing note produced in response to a user question), so query-generated outputs are captured alongside uploaded documents.

**Anomaly Alerts**

• The Anomaly Alerts sidebar item should visually indicate unresolved anomalies - e.g., a red badge displaying the current count of open/unattended anomalies.• Admin users can globally enable or disable anomaly alerts.• Any authenticated user (not only Admins) can be assigned to, or take ownership of, resolving/attending to a flagged anomaly.• The anomaly detection scope should extend beyond generation/tariff data to also include:◦ Discrepancies identified within uploaded Documents (e.g., conflicting figures between filings).◦ Discrepancies or flagged issues arising from Legal Matters records.◦ Discrepancies or notable conflicts surfaced within the News and Updates section (e.g., a report contradicting an official regulatory filing).

**News and Updates**

• Add a new “News and Updates” section to the sidebar, aggregating Nigerian power sector news from multiple external sources (regulatory bodies, market operators, and trade press).• Each item should display source attribution, publication timestamp, and a link to the original article, along with a short summary.• This section should feed into the Anomaly Alerts engine as described above, so that conflicting or noteworthy reports can be flagged as anomalies for review.