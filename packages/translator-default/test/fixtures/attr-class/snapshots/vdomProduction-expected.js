const _marko_template = _t();

export default _marko_template;
import _marko_class_merge from "marko/dist/runtime/helpers/class-value";
import _customTag from "./components/custom-tag.marko";
import _marko_tag from "marko/dist/runtime/helpers/render-tag";
import _marko_dynamic_tag from "marko/dist/runtime/helpers/dynamic-tag";
import _marko_renderer from "marko/dist/runtime/components/renderer";
import { t as _t } from "marko/dist/runtime/vdom";
import { r as _marko_registerComponent } from "marko/dist/runtime/components/registry-browser";

const _marko_componentType = _marko_registerComponent("TKoJdMQb", () => _marko_template),
      _marko_component = {};

_marko_template._ = _marko_renderer(function (input, out, _component, component, state) {
  out.e("div", {
    "class": _marko_class_merge(["a", {
      b: c,
      d
    }])
  }, "0", component, 0, 1);
  out.e("div", {
    "class": "a b"
  }, "1", component, 0, 1);
  out.e("div", {
    "class": "a b c"
  }, "2", component, 0, 1);

  _marko_tag(_customTag, {
    "class": ["a", {
      b: c,
      d
    }]
  }, out, _component, "3");

  _marko_tag(_customTag, {
    "class": ["a", false, "b"]
  }, out, _component, "4");

  _marko_dynamic_tag(out, input.test, () => ({
    "class": ["a", {
      b: c,
      d
    }],
    "test": {
      "class": ["a", {
        b: c,
        d
      }],
      "renderBody": out => {
        out.t("Hello", component);
      }
    }
  }), null, null, null, _component, "5");
}, {
  t: _marko_componentType,
  i: true
}, _marko_component);
import _marko_defineComponent from "marko/dist/runtime/components/defineComponent";
_marko_template.Component = _marko_defineComponent(_marko_component, _marko_template._);