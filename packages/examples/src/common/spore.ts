import { ccc } from "@ckb-ccc/shell";
import { Cell as LumosCell } from "@ckb-lumos/base";

import {
  Action,
  assembleTransferSporeAction,
  assembleCobuildWitnessLayout,
  assembleCreateClusterAction,
  assembleCreateSporeAction,
  assembleTransferClusterAction,
} from "@spore-sdk/core/lib/cobuild/index.js";

export const generateClusterCreateCoBuild = (
  clusterOutput: ccc.CellOutput,
  clusterOutputData: string
): string => {
  const output = {
    cellOutput: convertCellOutput(clusterOutput),
    data: clusterOutputData,
  } as LumosCell;
  const { actions } = assembleCreateClusterAction(output);
  return assembleCobuildWitnessLayout(actions);
};

// convert ckb-ccc.CellOutput to CKBComponents.CellOutput
function convertCellOutput(
  cellOutput: ccc.CellOutput
): CKBComponents.CellOutput {
  return {
    capacity: cellOutput.capacity.toString(),
    lock: cellOutput.lock,
    type: cellOutput.type,
  };
}
