/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function() {

    const PLAN_QUERY = `\
query(
    $modes: String!,
    $from: InputCoordinates!,
    $to: InputCoordinates!,
    $locale: String!,
    $wheelchair: Boolean!,
    $date: String,
    $time: String,
    $arriveBy: Boolean,
    $walkReluctance: Float,
    $walkBoardCost: Int,
    $walkSpeed: Float,
    $minTransferTime: Int
    ) {

    plan(
        from: $from,
        to: $to,
        date: $date,
        time: $time,
        arriveBy: $arriveBy,
        locale: $locale,
        wheelchair: $wheelchair,
        modes: $modes,
        walkReluctance: $walkReluctance,
        walkBoardCost: $walkBoardCost,
        walkSpeed: $walkSpeed,
        minTransferTime: $minTransferTime
    ) {
        to { name }
        from { name }
        itineraries {
          startTime,
          endTime,
          walkDistance,
          duration,
          legs {
            transitLeg
            mode
            trip { tripHeadsign }
            route { longName, shortName }
            intermediateStops { name }
            startTime
            endTime
            from {
              lat
              lon
              name
              stop {
                code
                name
              }
            },
            to {
              lat
              lon
              name
            },
            agency {
              id
            },
            distance
            legGeometry {
              length
              points
            }
          }
        }
     }
}\
`;

    return {
      planQuery(variables) {
          return {
            query: PLAN_QUERY,
            variables
          };
        }
    };
});
