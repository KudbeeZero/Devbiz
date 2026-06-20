# Owner Rules and Safety

## Non-Negotiable Rules

- **One active PR lane at a time** unless owner explicitly approves multiple.
- Every new work stream must be registered in Mission Control / AI Command Center first.
- **No secrets** of any kind in the repository.
- **No production deployments** without explicit owner approval.
- **No fake success states** (especially login, backend responses, AI, or wallet state).
- `/dev/plant-review` must remain strictly local-development only.

## Closeout Format (Required)

All agent responses must end with:

```
Asked:
Done:
Needs you:
```

If owner action is required, start with:

```
Owner action now:
```

## Scope Discipline
Do not perform work outside the current scoped task. If something important is discovered outside scope, note it in the closeout under “Needs you”.

## Honesty Principle
When backend, AI, or wallet systems are not yet implemented, clearly state the current honest state rather than simulating functionality.