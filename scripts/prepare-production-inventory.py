#!/usr/bin/env python3
"""Prepare reviewable source inventories locally; never upload or deploy."""
import argparse
import hashlib
import json
import pathlib
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--stage", help="New local directory for build validation only")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    output = pathlib.Path(args.output).resolve()
    if output == root or root in output.parents:
        raise SystemExit("Evidence output must be outside the checkout")

    def git(*values):
        return subprocess.check_output(["git", "-C", str(root), *values])

    commit = git("rev-parse", "HEAD").decode().strip()
    policy_path = "deployment/production-inventory-policy.json"
    policy_bytes = git("show", f"{commit}:{policy_path}")
    policy = json.loads(policy_bytes)
    files, excluded = [], []
    for item in git("ls-tree", "-rz", commit).split(b"\0"):
        if not item:
            continue
        metadata, path_bytes = item.split(b"\t")
        mode, kind, blob = metadata.decode().split()
        path = path_bytes.decode()
        if kind != "blob" or mode not in ("100644", "100755"):
            raise SystemExit(f"Unsupported source entry: {path}")
        reason = None
        if not (path in policy["include_files"] or any(path.startswith(p) for p in policy["include_prefixes"])):
            reason = "outside application/shared-source roots"
        elif path in policy["exclude_files"]:
            reason = "explicit reviewed exclusion"
        elif any(path.startswith(p) for p in policy["exclude_prefixes"]):
            reason = "local test or SDK authoring source; public built SDK assets retained"
        elif any(path.endswith(s) for s in policy["exclude_suffixes"]):
            reason = "local regression/fixture source"
        body = git("cat-file", "blob", blob)
        row = {"file": path, "size": len(body), "sha": hashlib.sha1(body).hexdigest(),
               "sha256": hashlib.sha256(body).hexdigest(), "git_blob": blob, "git_mode": mode}
        if reason:
            excluded.append({**row, "reason": reason})
        else:
            row["security_status"] = "BLOCKED_REQUIRED_RUNTIME" if path in policy["security_blocked_required_files"] or row["sha"] in policy["security_rejected_hashes"] else "REVIEW_CANDIDATE"
            files.append(row)
    included = {row["file"] for row in files}
    missing = set(policy["required_files"]) - included
    if missing:
        raise SystemExit(f"Required files excluded: {sorted(missing)}")
    blocked = [row for row in files if row["security_status"] == "BLOCKED_REQUIRED_RUNTIME"]
    common = {"candidate": commit, "parent": git("rev-parse", "HEAD^").decode().strip(),
              "tree": git("rev-parse", "HEAD^{tree}").decode().strip(),
              "application_candidate": policy["application_candidate"],
              "policy_sha256": hashlib.sha256(policy_bytes).hexdigest(),
              "project_id": policy["project_id"], "team_id": policy["team_id"],
              "approval_status": "NOT_APPROVED_REVIEW_CANDIDATE", "deployment_ready": False,
              "production_v1": "HOLD"}
    output.mkdir(parents=True, exist_ok=True)

    def write(name, value):
        data = (json.dumps(value, indent=2) + "\n").encode()
        (output / name).write_bytes(data)
        return hashlib.sha256(data).hexdigest()

    required_hash = write("PRODUCTION-REQUIRED-MANIFEST.json", {**common, "files": files,
        "file_count": len(files), "distinct_blobs": len({r["sha"] for r in files}),
        "blocked_required_files": blocked, "excluded_files": excluded,
        "note": "Local build inventory only. Blocked required files are NOT cleared for upload."})
    eligible = [row for row in files if row["security_status"] != "BLOCKED_REQUIRED_RUNTIME"]
    eligible_hash = write("UPLOAD-ELIGIBLE-MANIFEST.json", {**common, "files": eligible,
        "file_count": len(eligible), "distinct_blobs": len({r["sha"] for r in eligible}),
        "missing_required_security_clearances": blocked,
        "note": "Contains no known security-rejected files. Incomplete for deployment; WS-022 review still required."})
    stage = pathlib.Path(args.stage).resolve() if args.stage else None
    if stage:
        if stage.exists():
            raise SystemExit("Stage must be a new directory; existing data is never overwritten")
        stage.mkdir(parents=True)
        for row in files:
            target = stage / row["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            body = git("cat-file", "blob", row["git_blob"])
            target.write_bytes(body)
            target.chmod(0o755 if row["git_mode"] == "100755" else 0o644)
    print(json.dumps({"candidate": commit, "required_files": len(files), "excluded_files": len(excluded),
        "blocked_required_files": len(blocked), "production_required_manifest_sha256": required_hash,
        "upload_eligible_manifest_sha256": eligible_hash, "local_build_stage": str(stage) if stage else None,
        "deployment_ready": False}, indent=2))


if __name__ == "__main__":
    main()
