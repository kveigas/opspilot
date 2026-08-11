from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerQualification
from sqlalchemy.orm import Session


def is_worker_qualified_for_campaign(db: Session, worker: Worker, campaign: Campaign) -> bool:
    """
    Service-level eligibility helper for conditional qualification:
    - IF campaign.calibration_required == True:
        Worker qualification status for the campaign must be PASSED.
    - IF campaign.calibration_required == False:
        Lack of calibration does not independently block worker eligibility.
    """
    if not campaign.calibration_required:
        return True

    qual = (
        db.query(WorkerQualification)
        .filter(
            WorkerQualification.worker_id == str(worker.id),
            WorkerQualification.campaign_id == str(campaign.id),
        )
        .first()
    )

    return qual is not None and str(qual.status) == "PASSED"
