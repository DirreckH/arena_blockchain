import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class InternalValidationProofRecordDto {
  @IsString()
  @MaxLength(128)
  propositionId!: string;

  @IsBoolean()
  proofComplete!: boolean;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  failures!: string[];

  @IsString()
  @MaxLength(24)
  releaseReadinessStatus!: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  releaseBlockingDependencies!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(24)
  validationRehearsalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  validationCurrentStepId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  validationCurrentStepStatus?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedStepCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  remainingStepCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  latestCheckpointStepId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  latestCheckpointStatus?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  latestCheckpointAt?: string | null;

  @IsOptional()
  @IsBoolean()
  publicSettledResultVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  publicIntegrityOverviewVisible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutLedgerEntryCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutRecordCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutFinalizedWithoutPayoutCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutExecutingWithoutTxHashCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutStaleExecutingCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutStaleExecutingWithoutTxHashCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutStaleExecutingAwaitingConfirmationCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPayoutCompletedWithExecutionTxHashCount?: number;

  @IsOptional()
  rewardPayoutStatusCounts?: {
    requested?: number;
    approved?: number;
    executing?: number;
    completed?: number;
    failed?: number;
    cancelled?: number;
    none?: number;
  };

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  summaryArtifactPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  evidenceArtifactPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  publicResultArtifactPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  rewardPayoutArtifactPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  publicIntegrityArtifactPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  checkedAt?: string;
}
