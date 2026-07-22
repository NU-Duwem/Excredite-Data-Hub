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





###newupdates
o **Documents**\- "Document Title" field - a new, separate field for naming the saved/exported document (distinct from the keywords/search field), auto-suggested but editable.- Optional "Link to Legal Matter" field/toggle - a non-mandatory way to tie a document to a specific case from the Legal Matters registry, kept separate from the main Keywords field so it doesn't force every document through a legal workflow.- Rename "Subject / Matter Reference" to "Keywords" -since it's functioning as a general search/filter input, not a legal case identifier.- Split “Repository & Upload” tab into two different tabs: “Upload” and “View Document” - Replace “Briefings/Briefing” with “Documents/Document” across the board.- “AI EDIT SUGGESTION” and “Ask a question about the document” should be one functionality- An option for 7days, 14days, 30days, All-time, custom – When selecting a date range for document generation.- Option to deselect a document after it has been selected for upload.- Upload sequence should have a preview feature.- “Register document” button should be labelled “Upload document”

o "Link to Legal Matter" detailed design- Toggle control -"Link to a Legal Matter" as an off-by-default toggle, visually distinct from required fields, placed below "Keywords."- Searchable matter dropdown (revealed on toggle-on) - autocomplete search against the Legal Matters registry by reference code, client name, or matter type, with status/client context shown inline in results.- Confirmation chip after selection - shows the linked matter (e.g. "✓ Linked to LIT/2025/08 (AEDC - Active)") with an \[×\] to unlink without retoggling.- Independent behaviour from Keywords - linking a matter does _not_ auto-populate or restrict the Topic field; the two stay decoupled.- Optional auto-suggestion for Document Title - when a matter is linked, offer a suggested title (e.g. "AEDC - Grid Instability Document"), still editable.- Soft confirmation nudge on link - a small message explaining the effect ("This document will be traceable to LIT/2025/08 in the matter's document history").- Live summary line updated to reflect linkage - e.g. "This will compile 12 documents (Generation Data) from Jul 7–14, 2026, linked to LIT/2025/08."- Non-restrictive linkage - linking is metadata-only; it does not filter or limit which documents/data categories can be pulled into the document.- Two-way traceability / "Related Documents" surface - linked documents should also appear back on the corresponding matter's detail view within the Legal Matters page, closing the loop between the two features.

**\- AI query interface​**\- Should be linked to Documents, Legal matters and News and Updates.

**\- Profile & settings- Remove “Power” in roles for all users e.g. Power CEO should be just CEO- Reset password sequence should be split into two options- “Update password” and “Forgot password”. They should both be buttons that bring up or open up the appropriate forms when clicked.- User profile “CHIEF” to “CEO” across the board.- Name change “Expo” to “Ekpo” it should reflect in the emails.**




####update3
**Document**

• Add a subtitle under the 'Document Configuration' heading — a short descriptive line explaining the panel's purpose, e.g. 'Define parameters to compile documents from the repository,' rewritten to reference 'Keywords' and 'Documents' rather than older terminology. • Add a search icon inside the Keywords input field (left-aligned, magnifying-glass style), so it visually reads as a search input rather than a plain text field. • Add scope-guidance helper text above the Generate button — an inline message that appears when filters are incomplete, such as '⚠ Configure filters above to see scope,' referencing 'Generate Document.' • Add a 'Save configuration' link below the Generate button, allowing users to save and reuse their current filter setup. • Generate button – enabled once the user inputs a document title. • Ensure both empty states exist for the Document Preview panel: an 'Awaiting Input' state shown before any generation starts, and a distinct loading/generating state (e.g. skeleton placeholder bars) shown while a document is being compiled."• Include a box for specifying the title of the intended document to be created and implement the necessary logic.• Title is the only necessary requirement to generate a document. Other parameters can be unspecified if the user deems it fit. Meaning documents can be created without necessarily referencing the documents or files in the database.• Remove “all-time” from date range in Document Generator.• Keywords and Data Categories are automatically selected by the AI.• Share, Edit login and button should be available once the document is created in Document Generator.• Remove “Privileged” or “legal\_privileged” from the classes of document. Documents classes should only be visible to admin.• Remove the tab “AI Query Outputs”, generated documents should appear in the “Document Generator” tab.• Option to select output format when generating a document i.e. PDF, DOCX, Spreadsheet, On-screen

**AI Query Interface**

• Queries requesting for document availability or creation get created and output in the appropriate Document page section. i.e. this happens after a logic checks if tasks was successful.• Document button should give options of the various functionalities it has i.e. Upload, View Document, Document Generator and each option when clicked links to that section in the Documents page.• Notification after document creation or availability e.g an icon on top the Documents Icon and links in other pages. Clicking it takes one to the appropriate section. The button should blink when task is complete and output is ready ( for visual feedback).

**News & Updates**

• Remove the buttons beside the search bar i.e. All, NERC, NBET, TCN, BusinessDay, Vanguard.**• Legal Matters**• Remove the “Priority” column• Remove “Next deadline”• Change “Lead counsel” to “Counsel”• Button and sequence for inputting legal matters into the database via the legal matters page.

**Left pane arrangement.**

• AI Query Interface• Conversation History• Documents• News & Updates• Legal Matters• Anomaly Alerts• Forecasts• Admin panel• Profile & Settings• The above should be the arrangement of the left pane for all users, admin panel should be visible only to the admin.

**UI/UX**

• Distinct visual feedback when items on the left pane are hovered over or/and selected.• Distinct visual feedback when icons across the site are hovered over or/and selected.• Colour should not be monochromatic - use different but complementary colours across the site, but maintain the theme colour for important features.

**Conversation History**

• Give more options for history duration• Remove the tags from Saved AI sessions i.e. generation, regulatory, tariffs, gas/thermal• Selecting a previous search should automatically open a pane in the Conversation History tab in order for the user to view it

**Anomaly Alerts**

• Remove “Deviation” column• Status should either be Resolved, or unresolved• Unreviewed, Assigned, All alerts should be Resolved or Unresolved.• Sources – remove “Generation”, replace with “Forecast”• Ingestion problems, system wide problems should appear here and be visible to only the admin.





#######nupdate4
LEGAL MATTERS.

o Change page title from "Legal Matters" to Regulatory & Advisory Matters• Change subtitle from "Professional case management and litigation tracking" to Active engagements across the Nigerian Electricity Supply Industry• Rename "COUNSEL" column to LEAD ADVISOR• Add Matter Type column - NERC Enforcement, Tariff Dispute, Licence Application, Grid Code Violation, Gas Supply Dispute, Market Settlement, Policy Advisory• Add Regulatory Instrument column - the specific NERC order, MYTO determination, or Electricity Act section the matter relates to• Add Forum column - NERC Tribunal, Federal High Court, CAMA Arbitration, NERC Rate Case• Add Next Deadline column with colour highlighting - red for overdue, amber for within 7 days• Add a one-line matter description on each row so the reader understands the substance without clicking• Add a KPI summary strip above the table showing total active matters, matters before NERC, imminent deadlines, and matters by type• Restore Briefing Notes and Conversation History to the sidebar - they have disappeared from this version• Update "OPEN NEW MATTER" button label to + New Engagement to reflect consulting rather than legal firm language

ANOMALY ALERTS

• The subtitle is wrong - "unusual patterns across forecasts, documents, legal matters, and news" is too broad and inaccurate. Anomaly detection is specifically for generation output data from power plants. Change to: _AI-generated alerts for unusual generation patterns detected across active power plants_• "ALL SOURCES" dropdown is vague - sources should be specific to the power sector. Rename and populate with: All Plants, GENCOs, Thermal Plants, Hydro Plants, IPPs• "UNRESOLVED" should be UNREVIEWED - this matches the database schema which stores UNREVIEWED, REVIEWED, and DISMISSED as the three status values• The table is missing critical columns from the requirements document - currently only ENTITY/SOURCE, DATE, TYPE, STATUS are shown. Add:o Plant Type - Thermal, Hydro, Solaro Deviation - how many standard deviations from the 30-day rolling averageo Expected Output (MWh) - what was expectedo Actual Output (MWh) - what was recordedo AI Analysis - the plain English explanation generated by Claude• The TYPE column values need to reflect the database CHECK constraint - only these four values are valid: HIGH\_OUTPUT, LOW\_OUTPUT, ZERO\_OUTPUT, CURTAILMENT\_SPIKE• No KPI summary strip - add counts at the top showing total unreviewed alerts, zero output events, and curtailment spikes• No Mark Reviewed or Dismiss action visible anywhere on the table - these need to be accessible without clicking into a detail view• The empty state message is too bare - since the database has no generation data yet, the empty state should explain why: _No generation data has been loaded yet. Alerts will appear automatically once the TCN daily report ingestion pipeline is active._• Briefing Notes is missing from the sidebar again - this keeps disappearing between versions• No unread badge on the Anomaly Alerts sidebar item - when new alerts exist, a red numeric count should appear next to the menu item

FORECAST.

• 7-day forecast is too short - the requirements document specifies 30-day and 90-day horizons. A 7-day window does not give enough lead time for advisory work. Replace the 7-day chart with a toggle between 30 days and 90 days.• The forecast horizon toggle is missing - there should be a visible 30 Day / 90 Day toggle button above or beside the chart. Currently the only selector is the TOTAL GENERATION dropdown which switches metric type but not time horizon.• No historical data line on the chart - the requirements specify the chart should show historical data as a solid line up to today, then switch to a dashed forecast line from today onwards. Currently the entire line appears to be forecast data with no historical context shown alongside it.• Units are inconsistent - the chart y-axis shows MW but the KPI card shows 4,850 MW labelled as PROJECTED PEAK. For a generation forecast the correct unit for daily totals is MWh not MW. MW is instantaneous capacity, MWh is energy generated over time. The developer needs to clarify with you which unit the platform should use and apply it consistently everywhere.• No plant selector - the requirements specify a plant selector dropdown so users can view the forecast for a specific plant rather than only the national aggregate. This is important for GENCO clients who want to see their own plant's forecast.• No last updated timestamp - the requirements specify when the forecast was last generated. This tells users how current the model output is. Add it below the chart title - for example _Last updated: Monday 13 July 2026 at 06:00_.• No tariff forecast view - the TOTAL GENERATION dropdown implies switching to tariff but the tariff forecast is a completely different chart with different axes - Naira per kWh on the y-axis instead of MW. Confirm with the developer that switching the dropdown actually changes the chart type and axis labels, not just the title.• The confidence score of 92% needs context - a number alone is not enough. Add a small label beneath it explaining what it means - for example _Model trained on 15 years of TCN data_ - so users understand why they should trust this figure.• Download CSV button is missing - the requirements document specified a Download CSV button for the forecast data. The EXPORT ANALYSIS button may serve this purpose but the label is ambiguous - clarify whether it exports the chart as an image, the underlying data as CSV, or generates a briefing note PDF.

ADMIN PANEL

• Real names and email addresses of staff are fully visible in this screenshot — before sharing screenshots externally, mask this data. Flag this to the developer to add a data masking option for demo mode. • The Configure link is too vague. Replace with specific actions on each row — Reset Password, Change Role, Deactivate, each as a distinct button or dropdown. • No Create New User button is visible anywhere on this panel. It should be prominent at the top right of the User Directory section. • The Quick Actions panel only has two items — Go to AI Query Dashboard and Manage My Settings. These are not admin actions. Replace with genuinely useful admin quick actions — Trigger Data Refresh, View System Logs, Check Pipeline Status, Force Logout All Sessions. • The Duty & Role Configuration empty state says "No User Selected" — change to something more instructive such as _Select a user from the directory to view and edit their permissions and access level._• The role names do not match the database account names. The page shows CEO, LEGAL EXPERT, IT EXPERT, RESEARCH ANALYST — The database account names like power\_ceo, power\_legal, power\_analyst are internal infrastructure naming conventions — they should never be visible to users on the frontend. The frontend should use clean, professional display names throughout.

Here is the recommended mapping:

**Database Account**

**Frontend Display Name**

power\_admin

System Admin

power\_ceo

Chief Executive Officer (CEO)

power\_legal

Legal Team

power\_analyst

Research Analyst

power\_ingestion

Data Ingestion

power\_team

General Staff

power\_ai

AI Service

power\_app

Application

• The developer should maintain this mapping in a single configuration file on the frontend — a simple object that translates database role names to display names everywhere they appear. This way if a role name ever changes in the database, only one file needs updating on the frontend rather than hunting through every page.• The database account names should never appear in any user-facing text — not in the role badge on the profile card, not in the permissions matrix column headers, not in the user directory table, not in error messages, and not in any tooltip or label anywhere on the platform.