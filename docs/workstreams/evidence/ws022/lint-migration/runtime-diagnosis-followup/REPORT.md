# Runtime followup at exact reviewed SHA

PR577: https://github.com/nomadinc/tracekit/pull/577 ; candidate775cbec41b1d937ea59a56d47276ae1a0ecc1c36 frombcd. Preview dpl_7k7MGrKLWRNWYhJwMhMED6GU9cbK READY, sourceSHAverified, URL https://tracekit-staging-12hzpje48-tracekit.vercel.app. No production deployment.

Code fixes and complete diagnosis, localchecks, independentreview androllback: https://github.com/nomadinc/tracekit/tree/775cbec41b1d937ea59a56d47276ae1a0ecc1c36/docs/workstreams/evidence/ws022/runtime-diagnosis-20261014 . Fresh fullUI rerun aftercommit1465/0/0 attachedhere. Reviewer confirmed finalcommit source review remainsvalid. No new blockingfinding; no independentlive acceptance claimed.

Core destination https://api.trace-kit.io; unauthenticated GET /v1/customers and separately /v1/customer-orders each401 {ok:false,error:unauthorized}. No credentials sent. Authenticated previewserverless both401; same scopedproxy credentialselector. Exactbaseline deployment omitsstagingselector and chooseslegacykey; metadataflagonlyprojectproductiontarget. Alreadyprovisionedstagingkey acceptance unproven pending authorizedconfiguration and livevalidation. Rotation notassumedcause.

WorkOS callback logs400 missing_pkce_cookie for bothhistoricalwaitingflows,307freshflows. SyntheticSDKpaths distinguish absentcookie/state mismatch/expiredsealedstate with0providerrequests. Actual historical expiry/eviction cause remainsunproven; no PKCE/state/lifetimeprotectionchanged. Safeerrorwrapperdiagnostic/restartUIimplemented.

Configuration is unchanged. Pending coordination: add TRACEKIT_USE_STAGING_CORE_CREDENTIAL=enabled onlyon Previewbranch ws022/acceptance-runtime-diagnosis, and onlytwo exactnewpreviewcallback/root URLs to WorkOSStaging preserving existingentries/defaults. Questions presentedto user; no approval inferredfromelapsedtime. A selectorchange mayrequirea new previewdeployment; recordthenewID/SHA/URL and coordinateitscallback beforeauthenticatedtesting.

Owners: User/Stagingowner forconfigurationcoordination; Coreowner forupstreamacceptance, Customers andOrders; Authenticationowner/WS022 fordelayedbrowserreproduction; WS022 foraffectedclient/Admin/governednonmutatingacceptance. Allremainopenuntilverified. Prior evidence immutablewithoriginalcommits. PR575/576/577draft; WS001moneyHOLD, Meta inactive/uncertified, ProductionV1HOLD. No provider/financialwrites, membershipchanges orcredentialschanges.
