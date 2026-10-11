# DayOne Frontend Testing Checklist

## Local UI
- [ ] Welcome page renders on desktop and mobile.
- [ ] New-hire portal layout fits a narrow mobile screen.
- [ ] HR dashboard table scrolls horizontally on small screens.
- [ ] Keyboard focus is visible and form labels are usable.
- [ ] Empty search results show a clear message.
- [ ] Employee details modal opens and closes with button, backdrop and Escape.

## Preview mode
- [ ] Preview new hire button opens onboarding portal.
- [ ] Preview HR button opens admin dashboard.
- [ ] Search and status filters work.
- [ ] CSV export downloads a file.
- [ ] Invalid file type is rejected.
- [ ] File larger than 10 MB is rejected.
- [ ] Preview clearly states that files are not uploaded.
- [ ] Policy acknowledgement requires checkbox selection.

## Live integration (after APIs are deployed)
- [ ] Cognito sign-in and sign-out work.
- [ ] Employee can only see their own profile and progress.
- [ ] HR-only APIs reject non-HR users.
- [ ] Progress values match backend stage status.
- [ ] Presigned URL expires and is scoped as expected.
- [ ] File upload and upload registration both succeed.
- [ ] Document status updates after HR verification.
- [ ] API errors and network outages are handled gracefully.
- [ ] No secrets or sensitive documents appear in logs or repository.
