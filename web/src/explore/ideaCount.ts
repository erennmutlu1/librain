/*
 * How many recorded ideas there are, for text shown without loading the runs
 * (home page, Quick search, error messages, Explore's lede). It is counted at
 * build time from the tiny topic-pair list in TopicCombobox.data.ts, one entry
 * per recorded run: TopicCombobox.test.tsx keeps that list equal to the
 * src/explore/data/<batch>/runs/*.json glob, and explore.test.ts checks this
 * count against the loaded runs. So a new batch changes every such string
 * without a hand-written number. (A glob here would pull the runs into the
 * main bundle or split them into one chunk each.)
 */
import { RECORDED_TOPIC_PAIRS } from '../components/TopicCombobox.data';

export const RECORDED_IDEA_COUNT = RECORDED_TOPIC_PAIRS.length;
