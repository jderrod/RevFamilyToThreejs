1) What you’re building

A Revit External Command you run from the Family Editor.

It reads all family parameters (names, data types, instance/type, shared GUID, formulas, reporting flags).

It evaluates one or more Family Types, regenerates geometry, triangulates to triangles, converts units, and writes a single GLB file.

The GLB embeds your param schema + values under a top-level asset.extras.rvt object so a three.js app can read it and show controls.

2) Prerequisites and setup (conceptual)

Revit 2022 or newer, Visual Studio 2022, .NET Framework matching your Revit version (commonly 4.8), x64 build.

Add references to RevitAPI and RevitAPIUI assemblies from your Revit install directory.

Install a glTF/GLB writing library (for example, a .NET GLB writer via NuGet).

Create an External Command class (IExternalCommand) and register it with a standard Revit .addin manifest placed in the %ProgramData%\Autodesk\Revit\Addins\<RevitVersion>\ folder.

Ensure your add-in loads under the Add-Ins → External Tools menu.

Tip: keep your output directory configurable (e.g., a folder picker dialog), and store the last used path in a simple settings file.

3) High-level flow inside the command

Confirm the active document is a Family Document; if not, show a friendly message and exit.

Ask the user for:

Output folder

Detail Level to use (Coarse, Medium, Fine; default to Fine for fidelity)

Whether to export only the current Family Type or all Family Types

Collect the parameter schema:

Enumerate all parameters from the Family Manager

For each parameter, capture:

Name

Whether it is Instance or Type

Whether it is Reporting

Whether it is Shared and, if so, its stable GUID

Storage type (Double / Integer / String / ElementId)

Data type identifier (e.g., a ForgeTypeId / SpecTypeId when available)

Formula string (if any)

Build a list of Family Types to export:

If the user chose “current only,” just use the current type

Otherwise iterate all Family Types in the family

For each selected Family Type:

Begin a short transaction

Set the current type to the target type

Regenerate the family so constraints and formulas are resolved

Gather current values for every parameter in the schema (pay attention to read-only/reporting parameters)

Extract the solved geometry:

Retrieve geometry for all non-type elements in the family

Apply transforms for any nested instances

Triangulate faces of solids at the chosen Detail Level

Accumulate vertex positions, triangle indices, and normals

Convert Revit feet to meters for all length quantities

Normalize any computed normals

End/rollback the transaction (no permanent changes to the family)

Assemble a single GLB scene:

Option A (simple): one GLB containing one mesh node per exported Family Type

Option B (variant): write separate GLB files per Family Type

Embed the metadata on the GLB’s top-level asset “extras” under a single object (for example, rvt) that includes:

parameters: the schema array collected earlier

types: for each exported type, the name and a dictionary of parameter values (already unit-converted where appropriate)

units: a small object noting the conventions you used (e.g., length in meters, angle in radians)

Save the GLB(s) to disk and present a summary dialog (path, type count, vertex/triangle count).

4) Geometry extraction checklist

Use Revit’s geometry API to access a document’s GeometryElement with:

A consistent Detail Level (choose once; don’t mix)

Visibility flags that exclude construction/non-visible objects

Drill down through:

Top-level geometry

GeometryInstance (nested families) applying the instance transform

Solids → Faces → Triangulation

For each triangulated face:

Append positions (converted to meters)

Compute flat or averaged normals (consistency matters more than perfection for a first pass)

Record triangle indices

Common pitfalls:

Voids and cuts are applied at the solid level; if you see “extra” geometry, you may be picking up categories you don’t want—filter appropriately.

Curved faces may have large triangles at lower detail; stick to Fine for fidelity.

5) Parameter schema details

Each parameter record in your schema should include:

name: the displayed parameter name

isInstance: true/false

isReporting: true/false (reporting parameters are read-only and driven by geometry)

isShared: true/false

guid: present only if shared (useful as a stable key across projects)

storage: one of Double / Integer / String / ElementId

dataType: a stable data type identifier (length, angle, area, etc.) when available

formula: a string, or null if not formula-driven

Recommendation: keep doubles in SI in your metadata (meters for length), and also carry the original dataType so your viewer can show proper UI affordances and labels.

6) Parameter values per Family Type

For each exported type, store:

name: the Family Type name

values: a dictionary keyed by parameter name, with values:

Doubles converted to meters for length-typed parameters

Doubles left as radians for angle-typed parameters

Integers as is (include semantics in the dataType, e.g., Yes/No)

Strings as is

ElementIds as their integer value (or a stable identifier if you need to dereference later)

Important: Do not attempt to “set” reporting parameters; simply record their evaluated values.

7) Units and consistency rules

Length in Revit internal units is feet; convert to meters in all exported numeric positions and length values.

Angles via the API are radians; keep them as radians and label clearly in your units object.

Maintain a single coordinate space (no per-node scaling) so three.js consumers can measure confidently.

8) GLB packaging plan

Scene content:

One node per Family Type, or a single node if you export only the current type.

One or more primitives per node if you split meshes by category or material (optional).

Compression (optional but recommended):

If your writer supports Meshopt or Draco, enable it for smaller files.

Metadata:

Attach a single rvt object in asset.extras with:

parameters: array of schema records

types: array of { name, values }

units: { length: “meters”, angle: “radians” }

Naming:

Use the family name for the file and the type name for nodes.

9) Testing procedure (manual)

Choose a simple family (e.g., a rectangular panel) with Width, Height, Thickness, and one Yes/No parameter.

Export current type only at Fine detail. Confirm:

The GLB opens in a generic glTF viewer

Bounding measurements in the viewer align with expected meters

asset.extras.rvt.parameters contains all parameters with expected flags and data types

asset.extras.rvt.types[0].values matches the Family Type’s values (after unit conversion)

Switch the Family Type in the Family Editor, export again, and verify changes in geometry and values.

Enable all types export and confirm multiple nodes appear with distinct geometry/values.

Load the GLB in your three.js app and read asset.extras.rvt to auto-build a parameter form (no geometry changes yet—this step validates the metadata shape).

10) Optional: local round-trip without APS

If you want your browser to request new geometry on parameter changes while Revit is running on the same machine:

Add a lightweight local server in the add-in (for example, an HTTP listener).

Define an endpoint that accepts a JSON body of { parameterName: newValue, ... }.

Inside the command handler for that endpoint:

Set Family Manager values, regenerate, re-triangulate, rebuild GLB, and return the binary payload.

In your three.js app, POST the new values to the local endpoint and hot-swap the GLB.

Keep the server disabled by default and document the port and security expectations for internal use only.

11) Error handling and guardrails

If the document is not a Family Document, show an explicit instruction to open an .rfa in the Family Editor.

If no Family Types exist, prompt the user to create at least one.

On geometry traversal:

Skip null/empty geometry safely

Log counts of vertices/triangles for each type

On parameter capture:

Always include storage and dataType so the consumer can reason about units and UI controls

Handle shared parameter GUIDs gracefully when absent

On unit conversion:

Centralize your conversion rules and apply them everywhere (both geometry and parameter values)

12) Performance tips

For heavy families, consider:

Exporting only the current type during authoring, with an option to export all types on demand

Enabling mesh compression in GLB

Reducing detail level if fidelity is acceptable

Avoid duplicating identical meshes across types; if two types produce identical triangles, you can deduplicate nodes by hashing the vertex/index buffers and reusing mesh primitives (optional optimization).

13) Version differences (heads-up)

Data type identifiers (e.g., ForgeTypeId / SpecTypeId) and some API conveniences differ between Revit 2021, 2022, 2023, etc.

Decide your minimum supported Revit version. If you must support older versions:

Store raw doubles without conversion for ambiguous parameters and rely on the dataType string only when available

Include a note field in your metadata indicating which API was used to derive types

14) Deliverables checklist (ready for your IDE)

A compiled External Command add-in available under Add-Ins → External Tools

A configuration UI for:

Output folder

Detail Level (default Fine)

Scope (current type vs. all types)

A GLB writer integration producing:

One GLB per export run (either multi-node for all types or single-node for current type)

A top-level asset.extras.rvt object containing:

parameters (full schema with flags, storage types, data types, formulas, GUIDs)

types (name + values dictionary)

units (length: meters, angle: radians)

A short human-readable export report (counts, file path)

A sample family and a sample exported GLB for regression tests

15) How your three.js app will use the result (conceptual)

Load the GLB with your standard loader.

Read asset.extras.rvt to build a dynamic UI:

Number inputs for Double parameters (with unit labels)

Checkboxes for Yes/No (Integer) parameters

Text fields for String parameters

On “Apply,” either:

Switch among pre-exported types (instant), or

Send the parameter map to your local add-in’s endpoint (if you implemented it) and hot-swap the returned GLB