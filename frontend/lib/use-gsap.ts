"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
export type Timeline = gsap.core.Timeline;
export type Tween = gsap.core.Tween;
export type Context = gsap.Context;
export type MatchMedia = gsap.MatchMedia;
export type TweenVars = gsap.TweenVars;
export type TweenTarget = gsap.TweenTarget;
export default useGSAP;
