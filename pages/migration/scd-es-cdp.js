/////////////////////////////////
/// SCD Collateral Redemption ///
/////////////////////////////////

import React, { useState, useEffect } from 'react';
import useMaker from '../../hooks/useMaker';
import FlowBackground from '../../components/FlowBackground';
import FlowHeader from '../../components/FlowHeader';
import { Stepper, Grid, Flex } from '@makerdao/ui-components-core';
import Router from 'next/router';
// To add
import CollateralRedeem from '../../components/redeemscdvaults/CollateralRedeem'
import Confirmation from '../../components/redeemscdvaults/Confirmation';
import InProgress from '../../components/InProgress';
import Complete from '../../components/redeemscdvaults/Complete'
import Failed from '../../components/Failed';
import FadeInFromSide from '../../components/FadeInFromSide';

const steps = [
  props => <CollateralRedeem {...props} />,
  props => <Confirmation {...props} />,
  props => <InProgress {...props} title="Your collateral is being redeemed" />,
  props => <Complete {...props} />,
  props => (
    <Failed
      {...props}
      title="Redemption failed"
      subtitle="Your collateral in the Single Collateral Dai vault was not redeemed"
    />
  )
];

export default function() {
  const { account } = useMaker();
  const [currentStep, setCurrentStep] = useState(0);
  const [txHash, setTxHash] = useState(null);

  useEffect(() => {
    if (!account) Router.replace('/');
  }, []); // eslint-disable-line

  const toPrevStepOrClose = () => {
    if (currentStep <= 0) Router.replace('/overview');
    setCurrentStep(s => s - 1);
  };
  const toNextStep = () => setCurrentStep(s => s + 1);
  const reset = () => setCurrentStep(0);
  const showErrorMessageAndAllowExiting = () => setCurrentStep(4);

  return (
    // TODO list total PETH in your CDPs, PETH:WETH ratio
    <FlowBackground>
      <Grid gridRowGap={{ s: 's', l: 'xl' }}>
        <FlowHeader account={account} showClose={currentStep <= 1} />
        <Stepper
          steps={['Collateral Redemption', 'Confirmation']}
          selected={currentStep}
          m="0 auto"
          mt={'m'}
          p={['0 80px', '0']}
          opacity={currentStep < 2 ? 1 : 0}
          transition="opacity 0.2s"
        />

        <Flex position="relative" justifyContent="center">
          {steps.map((step, index) => {
            return (
              <FadeInFromSide
                key={index}
                active={currentStep === index}
                toLeft={index < currentStep}
                toRight={index > currentStep}
              >
                {step({
                  onClose: () => Router.replace('/overview'),
                  onPrev: toPrevStepOrClose,
                  onNext: toNextStep,
                  onReset: reset,
                  setTxHash,
                  txHash,
                  showErrorMessageAndAllowExiting
                })}
              </FadeInFromSide>
            );
          })}
        </Flex>
      </Grid>
    </FlowBackground>
  );
}
