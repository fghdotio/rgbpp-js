import { ccc } from "@ckb-ccc/shell";

import { Cell as LumosCell } from "@ckb-lumos/base";
import { UnpackResult } from "@ckb-lumos/codec";

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

export const generateSporeCreateCoBuild = ({
  sporeOutputs,
  sporeOutputsData,
  clusterCell,
  clusterOutputCell,
}: {
  sporeOutputs: ccc.CellOutput[];
  sporeOutputsData: ccc.Hex[];
  clusterCell: ccc.Cell;
  clusterOutputCell: ccc.CellOutput;
}): string => {
  if (sporeOutputs.length !== sporeOutputsData.length) {
    throw new Error(
      "The length of spore outputs and spore cell data are not same"
    );
  }
  let sporeActions: UnpackResult<typeof Action>[] = [];

  // cluster transfer actions
  const clusterInput = {
    cellOutput: convertCellOutput(clusterCell.cellOutput),
    data: clusterCell.outputData,
  } as LumosCell;
  const clusterOutput = {
    cellOutput: convertCellOutput(clusterOutputCell),
    data: clusterCell.outputData,
  } as LumosCell;
  const { actions } = assembleTransferClusterAction(
    clusterInput,
    clusterOutput
  );
  sporeActions = sporeActions.concat(actions);

  // spores create actions
  for (let index = 0; index < sporeOutputs.length; index++) {
    const sporeOutput = {
      cellOutput: convertCellOutput(sporeOutputs[index]),
      data: sporeOutputsData[index],
    } as LumosCell;
    const { actions } = assembleCreateSporeAction(sporeOutput);
    sporeActions = sporeActions.concat(actions);
  }
  return assembleCobuildWitnessLayout(sporeActions);
};
